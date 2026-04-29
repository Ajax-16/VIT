import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { bump, getNextVersion } from "./bump.js";

// ── Git remote helper ──────────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect "owner/repo" from git remote origin URL.
 * Supports both HTTPS and SSH remotes.
 */
function detectGithubRepo(cwd = process.cwd()) {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
    }).trim();
    const match =
      remote.match(/github\.com[:/]([^/]+\/[^/]+?)(\..+)?$/) ?? null;
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── GitHub API ─────────────────────────────────────────────────────────────────────────────────────────

async function githubRequest(path, token, body = null, method = "POST") {
  const { default: https } = await import("node:https");
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "vit-release-tool",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `GitHub API ${res.statusCode}: ${
                  json.message ?? JSON.stringify(json)
                }`,
              ),
            );
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`GitHub API parse error: ${data}`));
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Returns an existing open PR for head→base, or null if none found.
 */
async function findExistingPr({ token, repoSlug, head, base }) {
  const owner = repoSlug.split("/")[0];
  const path = `/repos/${repoSlug}/pulls?state=open&head=${owner}:${head}&base=${base}&per_page=1`;
  const data = await githubRequest(path, token, null, "GET");
  if (Array.isArray(data) && data.length > 0) {
    return { number: data[0].number, url: data[0].html_url };
  }
  return null;
}

async function createPullRequest({ token, repoSlug, head, base, title, body }) {
  const data = await githubRequest(
    `/repos/${repoSlug}/pulls`,
    token,
    { title, body, head, base, draft: false },
    "POST",
  );
  return { number: data.number, url: data.html_url };
}

// ── Promote strategies ──────────────────────────────────────────────────────────────────────────────────────

/**
 * STRATEGY: merge
 *
 * 1. Checkout target branch.
 * 2. Merge prerelease branch into target.
 * 3. Bump stable version on target.
 * 4. Push target branch.
 * 5. Fast-forward sync prerelease branch back to target.
 */
export async function promoteMerge({
  branch,
  targetBranch,
  bumpResult,
  commitMessage,
  config,
  vcs,
  dryRun,
  spinner,
}) {
  if (dryRun) {
    spinner.succeed(chalk.yellow("Dry-run completed — no changes made."));
    console.log();
    console.log(
      chalk.dim(
        `  [dry-run] merge   : ${branch} → ${targetBranch} (not executed)`,
      ),
    );
    console.log(
      chalk.dim(
        `  [dry-run] bump    : promote (strip suffix) on ${
          bumpResult.targets.join(", ")
        } (not executed)`,
      ),
    );
    console.log(chalk.dim(`  [dry-run] push    : skipped`));
    return { tag: null, bumpedProjects: [] };
  }

  const mergeSpinner = ora({
    text: `Merging ${branch} → ${targetBranch}...`,
    color: "cyan",
  }).start();

  vcs.checkout(targetBranch);
  vcs.mergeFromBranch(branch);
  mergeSpinner.succeed(chalk.green(`Merged ${branch} into ${targetBranch}.`));

  const result = await bump({
    targets: bumpResult.targets,
    bumpType: "promote",
    message: commitMessage,
    preId: null,
    config,
    vcs,
    dryRun: false,
  });

  const pushSpinner = ora({ text: "Pushing...", color: "cyan" }).start();
  vcs.pushWithTags();
  pushSpinner.succeed(chalk.green("Pushed."));

  // Sync prerelease branch to target (fast-forward)
  vcs.checkout(branch);
  try {
    execSync(`git merge --ff-only ${targetBranch}`, { stdio: "pipe" });
    vcs.pushWithTags();
    console.log(
      chalk.dim(
        `\n  ${chalk.cyan(branch)} synced to ${chalk.cyan(targetBranch)} (fast-forward).\n`,
      ),
    );
  } catch {
    console.log(
      chalk.yellow(
        `\n  ⚠ Could not fast-forward ${branch} to ${targetBranch}. Sync manually if needed.\n`,
      ),
    );
  }

  spinner.succeed(chalk.green("Promotion completed successfully!"));
  return result;
}

/**
 * STRATEGY: pr
 *
 * 1. Bump stable version on the prerelease branch (stay on it).
 * 2. Push the prerelease branch with the new stable tag.
 * 3. Check if a PR already exists for head→base. If so, reuse it.
 * 4. Otherwise open a new GitHub PR.
 * 5. Print the PR URL — human approves & merges from GitHub.
 *
 * Requires a GitHub token via config.github.token (supports ${VAR} interpolation)
 * or GITHUB_TOKEN env var as fallback.
 */
export async function promotePr({
  branch,
  targetBranch,
  bumpResult,
  commitMessage,
  config,
  vcs,
  dryRun,
  spinner,
}) {
  const token = config.github?.token || process.env.GITHUB_TOKEN || null;

  if (!token) {
    spinner.fail(chalk.red("PR strategy requires a GitHub token."));
    console.error(
      chalk.dim(
        "  Set the GITHUB_TOKEN environment variable or config.github.token.\n",
      ),
    );
    throw new Error("Missing GitHub token for PR strategy");
  }

  const repoSlug = config.github?.repo ?? detectGithubRepo() ?? null;

  if (!repoSlug) {
    spinner.fail(chalk.red("Could not determine GitHub repo slug."));
    console.error(
      chalk.dim(
        '  Set config.github.repo to "owner/repo" in vit-config.json.\n',
      ),
    );
    throw new Error("Missing GitHub repo slug for PR strategy");
  }

  let currentVersion = "?";
  try {
    const sample = config.projects.find((p) =>
      bumpResult.targets.includes(p.id),
    );
    if (sample) {
      const pkg = JSON.parse(
        readFileSync(resolve(sample.path, "package.json"), "utf-8"),
      );
      currentVersion = pkg.version;
    }
  } catch { /* non-fatal */ }

  const stableVersion = getNextVersion(currentVersion, "promote");

  if (dryRun) {
    spinner.succeed(chalk.yellow("Dry-run completed — no changes made."));
    console.log();
    console.log(
      chalk.dim(
        `  [dry-run] bump  : promote → ${stableVersion} on ${
          bumpResult.targets.join(", ")
        } (not executed)`,
      ),
    );
    console.log(chalk.dim(`  [dry-run] push  : ${branch} (not executed)`));
    console.log(
      chalk.dim(
        `  [dry-run] PR    : ${branch} → ${targetBranch} on ${repoSlug} (not created)`,
      ),
    );
    return { tag: null, bumpedProjects: [] };
  }

  const result = await bump({
    targets: bumpResult.targets,
    bumpType: "promote",
    message: commitMessage,
    preId: null,
    config,
    vcs,
    dryRun: false,
  });

  const pushSpinner = ora({ text: `Pushing ${branch}...`, color: "cyan" }).start();
  vcs.pushWithTags();
  pushSpinner.succeed(chalk.green(`${branch} pushed.`));

  const prSpinner = ora({ text: "Checking for existing pull request...", color: "magenta" }).start();

  const existing = await findExistingPr({ token, repoSlug, head: branch, base: targetBranch });

  let pr;
  let reused = false;

  if (existing) {
    pr = existing;
    reused = true;
    prSpinner.succeed(chalk.green(`Pull request #${pr.number} already exists — reusing it.`));
  } else {
    prSpinner.text = "Opening pull request...";
    pr = await createPullRequest({
      token,
      repoSlug,
      head: branch,
      base: targetBranch,
      title: `chore: promote ${branch} → ${targetBranch} (v${stableVersion})`,
      body:
        `## Promote \`${branch}\` → \`${targetBranch}\`\n\n` +
        `Version bumped to **v${stableVersion}** on \`${branch}\`.\n\n` +
        `Merge this PR to complete the promotion.`,
    });
    prSpinner.succeed(chalk.green(`Pull request #${pr.number} opened.`));
  }

  spinner.succeed(chalk.green(reused ? "Promotion PR updated!" : "Promotion PR ready!"));

  console.log(
    "\n" +
      chalk.bold("  PR URL  : ") +
      chalk.cyan.underline(pr.url) +
      "\n",
  );

  return { ...result, prUrl: pr.url, prNumber: pr.number };
}
