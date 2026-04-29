/**
 * lib/sync.js — vit sync
 *
 * Checks all preReleaseBranches to see if any are behind their configured
 * releaseBranches, and merges them forward (ff-only first, merge fallback).
 *
 * Safety rules:
 *   - Aborts if working tree is dirty.
 *   - Snapshots all SHAs before touching anything.
 *   - Pulls each release branch before comparing so local refs are up to date.
 *   - ff-only first; if it fails, falls back to a regular merge.
 *   - If a merge has conflicts → aborts and warns; never leaves repo dirty.
 *   - Returns the branch it started on at the end.
 */

import { execSync } from "child_process";
import chalk from "chalk";
import ora from "ora";

function git(cmd, cwd = process.cwd()) {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}

function isDirty() {
  return git("git status --porcelain").length > 0;
}

function headSha(ref) {
  return git(`git rev-parse ${ref}`);
}

/** Returns how many commits `branch` is behind `base`. 0 = up to date. */
function commitsBehind(branch, base) {
  try {
    const count = git(`git rev-list --count ${branch}..${base}`);
    return parseInt(count, 10);
  } catch {
    return 0;
  }
}

/** Fetches latest state of all relevant branches from remote (non-fatal). */
function fetchBranches(branches) {
  try {
    git(`git fetch origin ${branches.join(" ")}`);
  } catch { /* non-fatal — might be offline or branch not remote yet */ }
}

/**
 * Pulls (fast-forward only) a release branch so the local ref is up to date
 * before we compare or merge from it. Non-fatal: if offline or already
 * up-to-date, we just continue with whatever is local.
 */
function pullReleaseBranch(branch, originalBranch, vcs) {
  try {
    vcs.checkout(branch);
    git(`git pull --ff-only origin ${branch}`);
  } catch {
    /* non-fatal — offline, no remote, or already up to date */
  } finally {
    try { vcs.checkout(originalBranch); } catch { /* best-effort */ }
  }
}

export async function runSync({ config, vcs, dryRun }) {
  console.log("\n" + chalk.bold("  vit sync — checking branch alignment") + "\n");

  if (isDirty()) {
    console.error(chalk.red("  ✖ Working tree has uncommitted changes. Please commit or stash first.\n"));
    process.exit(1);
  }

  const releaseBranches  = config.git?.releaseBranches  ?? ["main"];
  const preReleaseCfg    = config.git?.preReleaseBranches ?? [];

  const preReleaseBranches = preReleaseCfg
    .map((p) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean)
    .filter((b) => !b.includes("*")); // skip glob patterns

  if (preReleaseBranches.length === 0) {
    console.log(chalk.dim("  No concrete preReleaseBranches configured. Nothing to sync.\n"));
    return;
  }

  const originalBranch = git("git rev-parse --abbrev-ref HEAD");

  // 1. Fetch all relevant branches from remote
  fetchBranches([...releaseBranches, ...preReleaseBranches]);

  // 2. Pull each release branch so local refs reflect remote state
  for (const base of releaseBranches) {
    const spinner = ora({
      text: `Pulling ${chalk.cyan(base)}...`,
      color: "blue",
    }).start();
    try {
      vcs.checkout(base);
      git(`git pull --ff-only origin ${base}`);
      spinner.succeed(chalk.dim(`${base} up to date`));
    } catch {
      spinner.warn(chalk.yellow(`Could not pull ${base} — using local ref`));
    } finally {
      try { vcs.checkout(originalBranch); } catch { /* best-effort */ }
    }
  }

  console.log();

  const results = []; // { branch, base, status, behind }

  for (const preBranch of preReleaseBranches) {
    // Pick the release branch this preRelease branch is most behind
    let maxBehind = 0;
    let targetBase = releaseBranches[0];

    for (const base of releaseBranches) {
      try {
        const behind = commitsBehind(preBranch, base);
        if (behind > maxBehind) {
          maxBehind = behind;
          targetBase = base;
        }
      } catch { /* branch might not exist locally yet */ }
    }

    if (maxBehind === 0) {
      results.push({ branch: preBranch, base: targetBase, status: "up-to-date", behind: 0 });
      console.log(
        chalk.green(`  ✔ ${chalk.cyan(preBranch).padEnd(30)} `) +
        chalk.dim(`up to date with ${targetBase}`)
      );
      continue;
    }

    const spinner = ora({
      text: `Syncing ${chalk.cyan(preBranch)} ← ${targetBase}  (${maxBehind} commit(s) behind)...`,
      color: "cyan",
    }).start();

    if (dryRun) {
      spinner.succeed(
        chalk.yellow(`[dry-run] ${preBranch} is ${maxBehind} commit(s) behind ${targetBase} — merge not executed`)
      );
      results.push({ branch: preBranch, base: targetBase, status: "dry-run", behind: maxBehind });
      continue;
    }

    const preSha = headSha(preBranch);

    try {
      vcs.checkout(preBranch);
    } catch (err) {
      spinner.fail(chalk.red(`Could not checkout ${preBranch}: ${err.message}`));
      results.push({ branch: preBranch, base: targetBase, status: "error", behind: maxBehind });
      continue;
    }

    // Try ff-only first, fallback to regular merge
    let synced = false;
    let method = "";

    try {
      git(`git merge --ff-only ${targetBase}`);
      synced = true;
      method = "fast-forward";
    } catch {
      try {
        git(`git merge ${targetBase} -m "chore: sync ${preBranch} with ${targetBase}"`);
        synced = true;
        method = "merge";
      } catch {
        // Conflicts — abort and restore
        try { git("git merge --abort"); } catch { /* already clean */ }
        try { git(`git reset --hard ${preSha}`); } catch { /* best-effort */ }
        spinner.warn(chalk.yellow(`${preBranch} has conflicts with ${targetBase} — skipped. Resolve manually.`));
        results.push({ branch: preBranch, base: targetBase, status: "conflict", behind: maxBehind });
        continue;
      }
    }

    // Push
    try {
      git(`git push origin ${preBranch}`);
      spinner.succeed(
        chalk.green(`${preBranch} synced with ${targetBase} `) +
        chalk.dim(`(${method}, ${maxBehind} commit(s))`)
      );
      results.push({ branch: preBranch, base: targetBase, status: "synced", behind: maxBehind, method });
    } catch {
      spinner.warn(chalk.yellow(`${preBranch} merged locally but push failed. Push manually.`));
      results.push({ branch: preBranch, base: targetBase, status: "synced-local-only", behind: maxBehind, method });
    }
  }

  // Return to original branch
  try {
    vcs.checkout(originalBranch);
  } catch { /* best-effort */ }

  // Summary
  const synced    = results.filter((r) => r.status === "synced" || r.status === "synced-local-only");
  const conflicts = results.filter((r) => r.status === "conflict");
  const upToDate  = results.filter((r) => r.status === "up-to-date");

  console.log("\n" + chalk.bold("  Sync summary") + "  " + chalk.dim(`(${results.length} branch(es) checked)`));
  console.log(chalk.dim("  ────────────────────────────────────────"));
  console.log(`  Up to date : ${chalk.green(upToDate.length)}`);
  console.log(`  Synced     : ${chalk.cyan(synced.length)}`);
  if (conflicts.length > 0) {
    console.log(`  Conflicts  : ${chalk.red(conflicts.length)}  ← resolve manually`);
    for (const r of conflicts) {
      console.log(chalk.dim(`    · ${r.branch} ← ${r.base}`));
    }
  }
  console.log();
}
