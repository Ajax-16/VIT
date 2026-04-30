import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { vcsLabel } from "../vcs/index.js";
import { printPreActionsSummary, runPreActions } from "../pre-actions.js";
import { printPostActionsSummary, runPostActions } from "../post-actions.js";
import { printError, resolveCommitMessage } from "./shared.js";

export async function run({ cli, config, vcs, dryRun }) {
  if (!vcs.supportsVersioning()) {
    console.log(
      chalk.yellow(`\n  ⚠ The current VCS (${vcsLabel(config.vcs?.provider)}) does not support this operation.\n`),
    );
    process.exit(0);
  }

  const commitMessage = await resolveCommitMessage({ cli, config, vcs, accion: "commit" });
  const actionsTrigger = "commit";

  // ── Summary ──────────────────────────────────────────────────────────────────────
  console.log("\n" + chalk.bold("  Operation summary:"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(`  Action    : ${chalk.cyan("commit")}`);
  console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
  if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
  if (commitMessage) console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
  console.log(`  Changelog : ${chalk.dim("none")}`);
  printPreActionsSummary(config, actionsTrigger);
  printPostActionsSummary(config, actionsTrigger);
  console.log();

  // ── Confirm ──────────────────────────────────────────────────────────────────────
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

  // ── Pre-actions ──────────────────────────────────────────────────────────────────
  try { await runPreActions(config, actionsTrigger); } catch (err) { printError(err); process.exit(1); }

  if (dryRun) console.log("\n" + chalk.bgYellow.black.bold("  DRY-RUN RESULTS  ") + "\n");

  // ── Execute ─────────────────────────────────────────────────────────────────────
  const spinner = ora({ text: dryRun ? "Simulating..." : "Executing...", color: "yellow" }).start();

  try {
    if (dryRun) {
      spinner.succeed(chalk.yellow(`Dry-run completed — commit "${commitMessage}" not executed.`));
    } else {
      vcs.addAll();
      vcs.commit(commitMessage);
      vcs.pushWithTags();
      spinner.succeed(chalk.green("Operation completed successfully"));
    }
    await runPostActions(config, actionsTrigger);
  } catch (err) {
    spinner.fail(chalk.red("Error during execution"));
    printError(err);
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      "\n" + chalk.yellow.bold("  ⚠  Dry-run finished. Nothing was written to disk, committed or pushed.") + "\n",
    );
  }
}
