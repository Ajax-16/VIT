import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { vcsLabel } from "../vcs/index.js";
import { printPreActionsSummary, runPreActions } from "../pre-actions.js";
import { printPostActionsSummary, runPostActions } from "../post-actions.js";
import { printError, runChangelogStep, resolveCommitMessage } from "./shared.js";

export async function run({ cli, config, vcs, dryRun, semanticChangelog }) {

  // ── Changelog step ────────────────────────────────────────────────────────────────
  const changelogDone = await runChangelogStep({ cli, config, dryRun, accion: "changelog", bumpResult: null, semanticChangelog });
  const actionsTrigger = "changelog";

  // ── Summary ──────────────────────────────────────────────────────────────────────────
  console.log("\n" + chalk.bold("  Operation summary:"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(`  Action    : ${chalk.cyan("changelog")}`);
  console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
  if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
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

  // ── Check VCS support ────────────────────────────────────────────────────────────────
  if (!vcs.supportsCommit()) {
    console.log(chalk.yellow("\n  ⚠ VCS does not support commit/push. Changelog saved locally.\n"));
    process.exit(0);
  }

  if (dryRun) {
    console.log(chalk.dim("\n  [dry-run] changelog commit — not executed\n"));
    process.exit(0);
  }

  // ── Confirm commit ─────────────────────────────────────────────────────────────────
  if (!cli.yes) {
    const { doCommit } = await inquirer.prompt([{
      type: "confirm", name: "doCommit",
      message: "Make commit and push of the changelog?",
      default: true,
    }]);
    if (!doCommit) {
      console.log(chalk.yellow("\n  Changelog saved locally. No commit.\n"));
      process.exit(0);
    }
  }

  // ── Commit message ─────────────────────────────────────────────────────────────────
  const commitMessage = await resolveCommitMessage({ cli, config, vcs, accion: "changelog" });

  // ── Execute ─────────────────────────────────────────────────────────────────────
  try { await runPreActions(config, actionsTrigger); } catch (err) { printError(err); process.exit(1); }

  const spinner = ora({ text: "Executing...", color: "yellow" }).start();

  try {
    vcs.addAll();
    vcs.commit(commitMessage);
    vcs.pushWithTags();
    spinner.succeed(chalk.green("Operation completed successfully"));
    await runPostActions(config, actionsTrigger);
  } catch (err) {
    spinner.fail(chalk.red("Error during execution"));
    printError(err);
    process.exit(1);
  }
}
