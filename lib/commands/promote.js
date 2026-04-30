import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getNextVersion } from "../bump.js";
import { vcsLabel } from "../vcs/index.js";
import { printPreActionsSummary, runPreActions } from "../pre-actions.js";
import { printPostActionsSummary, runPostActions } from "../post-actions.js";
import { promoteMerge, promotePr } from "../promote.js";
import { printError, runChangelogStep, resolveCommitMessage, resolveTargets } from "./shared.js";

export async function run({ cli, config, vcs, dryRun, branch, isOnPreReleaseBranch, preId, semanticChangelog, promoteStrategy }) {

  // ── Promote guard ────────────────────────────────────────────────────────────────
  if (!isOnPreReleaseBranch) {
    console.log(
      "\n" + chalk.bgRed.white.bold("  BLOCKED  ") + "  " +
      chalk.red.bold(`"promote" is only available from a prerelease branch.`) +
      "\n" + chalk.dim(`  Current branch "${branch}" is not listed in preReleaseBranches.`) +
      "\n" + chalk.dim(`  Switch to a prerelease branch before running promote.`) + "\n",
    );
    process.exit(1);
  }

  const targetBranch = cli.target ?? config.git.releaseBranches?.[0] ?? "main";

  // ── Select targets ─────────────────────────────────────────────────────────────────
  const targets = await resolveTargets({ cli, config });

  // ── Preview stable version ────────────────────────────────────────────────────────────
  const sample = (config.projects ?? []).find((p) => targets.includes(p.id));
  if (sample) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(sample.path, "package.json"), "utf-8"));
      const stableVer = getNextVersion(pkg.version, "promote");
      console.log(chalk.dim(`  Promote: ${chalk.cyan(pkg.version)} → ${chalk.green(stableVer)} (suffix stripped)\n`));
    } catch { /* non-fatal */ }
  }

  const bumpResult = { targets, bumpType: "promote", preId: null };

  // ── Changelog ─────────────────────────────────────────────────────────────────────────
  const changelogDone = await runChangelogStep({ cli, config, dryRun, accion: "promote", bumpResult, semanticChangelog });

  // ── Commit message ──────────────────────────────────────────────────────────────────
  const commitMessage = await resolveCommitMessage({ cli, config, vcs, accion: "promote" });
  const actionsTrigger = "release";

  // ── Summary ──────────────────────────────────────────────────────────────────────────
  console.log("\n" + chalk.bold("  Operation summary:"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(`  Action    : ${chalk.cyan("promote")}`);
  console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
  if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
  console.log(`  Targets   : ${chalk.cyan(targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan("promote")}`);
  console.log(
    `  Promote   : ${chalk.cyan(branch)} → ${chalk.cyan(targetBranch)}  ` +
    chalk.dim(`[strategy: ${promoteStrategy}]`),
  );
  if (commitMessage) console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
  console.log(
    `  Changelog : ${
      semanticChangelog
        ? changelogDone ? chalk.magenta("semantic — automatically generated") : chalk.dim("semantic — skipped")
        : changelogDone ? chalk.green("manual — entry added") : chalk.dim("none")
    }`,
  );
  printPreActionsSummary(config, actionsTrigger);
  printPostActionsSummary(config, actionsTrigger);
  console.log();

  // ── Confirm ───────────────────────────────────────────────────────────────────────
  if (!cli.yes) {
    const { proceed } = await inquirer.prompt([{
      type: "confirm", name: "proceed",
      message: dryRun ? "Run dry-run? (nothing will be written or pushed)" : "Confirm and execute?",
      default: true,
    }]);
    if (!proceed) { console.log(chalk.yellow("\n  Operation cancelled.\n")); process.exit(0); }
  } else {
    console.log(chalk.dim("  Auto-confirmed via --yes.\n"));
  }

  // ── Execute ─────────────────────────────────────────────────────────────────────
  try { await runPreActions(config, actionsTrigger); } catch (err) { printError(err); process.exit(1); }

  if (dryRun) console.log("\n" + chalk.bgYellow.black.bold("  DRY-RUN RESULTS  ") + "\n");

  const spinner = ora({ text: dryRun ? "Simulating..." : "Executing...", color: "yellow" }).start();

  try {
    const promoteArgs = { branch, targetBranch, bumpResult, commitMessage, config, vcs, dryRun, spinner };
    const result = promoteStrategy === "pr"
      ? await promotePr(promoteArgs)
      : await promoteMerge(promoteArgs);

    if (!dryRun) {
      console.log();
      for (const item of result.bumpedProjects ?? []) {
        console.log(`  ${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`);
      }
      if (result.tag) console.log(`  Tag         : ${chalk.cyan(result.tag)}`);
      if (result.prUrl) console.log(`  PR          : ${chalk.cyan.underline(result.prUrl)}`);
    }

    await runPostActions(config, actionsTrigger);
  } catch (err) {
    spinner.fail(chalk.red("Error during execution"));
    printError(err);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n" + chalk.yellow.bold("  ⚠  Dry-run finished. Nothing was written to disk, committed or pushed.") + "\n");
  }
}
