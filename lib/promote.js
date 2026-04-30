import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { bump, getNextVersion } from "./bump.js";

// ── Rollback helper ───────────────────────────────────────────────────────────────────
function rollback({ preBranch, preSha, preTargetSha, branch, targetBranch, vcs }) {
  try {
    vcs.checkout(targetBranch);
    vcs.resetHard(preTargetSha);
    vcs.pushForce(targetBranch);
  } catch { /* best-effort */ }
  try {
    vcs.checkout(branch);
    vcs.resetHard(preSha);
    vcs.pushForce(branch);
  } catch { /* best-effort */ }
  try { vcs.checkout(preBranch); } catch { /* best-effort */ }
}

// ── GitHub API ───────────────────────────────────────────────────────────────────
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
            reject(new Error(`GitHub API ${res.statusCode}: ${json.message ?? JSON.stringify(json)}`));
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

async function updatePullRequest({ token, repoSlug, number, title, body }) {
  await githubRequest(`/repos/${repoSlug}/pulls/${number}`, token, { title, body }, "PATCH");
}

/**
 * Detects "owner/repo" from the VCS remote URL.
 * Supports both HTTPS and SSH GitHub remotes.
 */
function detectGithubRepo(vcs) {
  try {
    const remote = vcs.getRemoteUrl();
    if (!remote) return null;
    const match = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/) ?? null;
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Promote strategies ─────────────────────────────────────────────────────────────────

/**
 * STRATEGY: merge
 *
 * The dirty-tree check is intentionally NOT here — it must be performed
 * by the caller BEFORE any changelog step runs, so that changelog
 * modifications are not falsely flagged as dirty.
 *
 * Steps:
 *   1. Snapshot HEAD SHAs of both branches for rollback.
 *   2. Checkout target branch.
 *   3. Merge prerelease branch into target (--no-ff for traceability).
 *   4. Bump stable version on target (picks up any staged changelog changes).
 *   5. Push target branch with tags.
 *   6. Sync prerelease branch back: ff-only first, merge fallback.
 *   7. Push prerelease branch.
 *
 * On any failure after the merge starts, rolls back both branches
 * to their pre-promote SHAs via force-with-lease.
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
    console.log(chalk.dim(`  [dry-run] merge   : ${branch} → ${targetBranch} (not executed)`));
    console.log(chalk.dim(`  [dry-run] bump    : promote (strip suffix) on ${bumpResult.targets.join(", ")} (not executed)`));
    console.log(chalk.dim(`  [dry-run] push    : skipped`));
    return { tag: null, bumpedProjects: [] };
  }

  const preBranch    = vcs.getCurrentBranch();
  const preSha       = vcs.getSha(branch);
  const preTargetSha = vcs.getSha(targetBranch);

  const rollbackCtx = { preBranch, preSha, preTargetSha, branch, targetBranch, vcs };

  // ─ Merge ─────────────────────────────────────────────────────────────────────────────
  const mergeSpinner = ora({ text: `Merging ${branch} → ${targetBranch}...`, color: "cyan" }).start();
  try {
    vcs.checkout(targetBranch);
    vcs.merge(branch, {
      noFf: true,
      message: `chore: merge ${branch} into ${targetBranch} for promotion`,
    });
    mergeSpinner.succeed(chalk.green(`Merged ${branch} into ${targetBranch}.`));
  } catch (err) {
    mergeSpinner.fail(chalk.red("Merge failed. No changes were made."));
    vcs.mergeAbort();
    vcs.checkout(preBranch);
    throw err;
  }

  // ─ Bump ─────────────────────────────────────────────────────────────────────────────
  let result;
  try {
    result = await bump({
      targets: bumpResult.targets,
      bumpType: "promote",
      message: commitMessage,
      preId: null,
      config,
      vcs,
      dryRun: false,
    });
  } catch (err) {
    spinner.fail(chalk.red("Bump failed. Rolling back..."));
    rollback(rollbackCtx);
    throw err;
  }

  // ─ Push target ─────────────────────────────────────────────────────────────────────
  const pushSpinner = ora({ text: `Pushing ${targetBranch}...`, color: "cyan" }).start();
  try {
    vcs.pushWithTags();
    pushSpinner.succeed(chalk.green(`${targetBranch} pushed.`));
  } catch (err) {
    pushSpinner.fail(chalk.red(`Push to ${targetBranch} failed. Rolling back...`));
    rollback(rollbackCtx);
    throw err;
  }

  // ─ Sync prerelease branch back ────────────────────────────────────────────────────────
  vcs.checkout(branch);
  const syncSpinner = ora({ text: `Syncing ${branch} with ${targetBranch}...`, color: "cyan" }).start();
  try {
    vcs.merge(targetBranch, { ffOnly: true });
    syncSpinner.succeed(chalk.green(`${branch} synced to ${targetBranch} (fast-forward).`));
  } catch {
    try {
      vcs.merge(targetBranch, { message: `chore: sync ${branch} with ${targetBranch}` });
      syncSpinner.succeed(chalk.green(`${branch} synced to ${targetBranch} (merge).`));
    } catch {
      syncSpinner.warn(chalk.yellow(`Could not sync ${branch} — conflicts detected. Resolve manually.`));
      vcs.mergeAbort();
    }
  }

  try {
    vcs.pushWithTags();
  } catch {
    console.log(chalk.yellow(`  ⚠ Could not push ${branch}. Push manually if needed.`));
  }

  spinner.succeed(chalk.green("Promotion completed successfully!"));
  return result;
}

/**
 * STRATEGY: pr
 *
 * 1. Bump stable version on the prerelease branch (stay on it).
 * 2. Push the prerelease branch with the new stable tag.
 * 3. Check if a PR already exists for head→base.
 *    - If yes: update its title and body to reflect the new version.
 *    - If no:  open a new PR.
 * 4. Print the PR URL — human approves & merges from GitHub.
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
    console.error(chalk.dim("  Set the GITHUB_TOKEN environment variable or config.github.token.\n"));
    throw new Error("Missing GitHub token for PR strategy");
  }

  const repoSlug = config.github?.repo ?? detectGithubRepo(vcs) ?? null;

  if (!repoSlug) {
    spinner.fail(chalk.red("Could not determine GitHub repo slug."));
    console.error(chalk.dim('  Set config.github.repo to "owner/repo" in vit-config.json.\n'));
    throw new Error("Missing GitHub repo slug for PR strategy");
  }

  let currentVersion = "?";
  try {
    const sample = config.projects.find((p) => bumpResult.targets.includes(p.id));
    if (sample) {
      const pkg = JSON.parse(readFileSync(resolve(sample.path, "package.json"), "utf-8"));
      currentVersion = pkg.version;
    }
  } catch { /* non-fatal */ }

  const stableVersion = getNextVersion(currentVersion, "promote");

  const prTitle = `chore: promote ${branch} → ${targetBranch} (v${stableVersion})`;
  const prBody =
    `## Promote \`${branch}\` → \`${targetBranch}\`\n\n` +
    `Version bumped to **v${stableVersion}** on \`${branch}\`.\n\n` +
    `Merge this PR to complete the promotion.`;

  if (dryRun) {
    spinner.succeed(chalk.yellow("Dry-run completed — no changes made."));
    console.log();
    console.log(chalk.dim(`  [dry-run] bump  : promote → ${stableVersion} on ${bumpResult.targets.join(", ")} (not executed)`));
    console.log(chalk.dim(`  [dry-run] push  : ${branch} (not executed)`));
    console.log(chalk.dim(`  [dry-run] PR    : ${branch} → ${targetBranch} on ${repoSlug} (not created)`));
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
    prSpinner.text = `Updating pull request #${pr.number}...`;
    await updatePullRequest({ token, repoSlug, number: pr.number, title: prTitle, body: prBody });
    prSpinner.succeed(chalk.green(`Pull request #${pr.number} updated with new version v${stableVersion}.`));
  } else {
    prSpinner.text = "Opening pull request...";
    pr = await createPullRequest({ token, repoSlug, head: branch, base: targetBranch, title: prTitle, body: prBody });
    prSpinner.succeed(chalk.green(`Pull request #${pr.number} opened.`));
  }

  spinner.succeed(chalk.green(reused ? "Promotion PR updated!" : "Promotion PR ready!"));
  console.log("\n" + chalk.bold("  PR URL  : ") + chalk.cyan.underline(pr.url) + "\n");

  return { ...result, prUrl: pr.url, prNumber: pr.number };
}
