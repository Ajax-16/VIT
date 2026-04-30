import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { printError } from "./shared.js";

export async function run({ cli, config, vcs, dryRun }) {
  const rollbackStrategy = config.git?.rollbackStrategy ?? "revert";

  if (!vcs.supportsVersioning()) {
    console.log(
      chalk.yellow(`\n  ⚠ The current VCS does not support this operation.\n`),
    );
    process.exit(0);
  }

  const tags = vcs.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow("\n  ⚠ No tags available.\n"));
    process.exit(0);
  }

  let selectedTag;

  if (cli.tag) {
    selectedTag = cli.tag;
    if (!tags.includes(selectedTag)) {
      console.log(
        chalk.red(`\n  ✖ Tag "${cli.tag}" not found. Available: ${tags.join(", ")}\n`),
      );
      process.exit(1);
    }
    console.log(chalk.dim(`  Tag: ${selectedTag}`));
  } else {
    const answer = await inquirer.prompt([{
      type: "list",
      name: "selectedTag",
      message: "Select the tag to rollback to:",
      choices: tags.map((t) => ({ name: t, value: t })),
      pageSize: 15,
    }]);
    selectedTag = answer.selectedTag;
  }

  const affectedCommits = vcs.getCommitsBetweenTagAndHead(selectedTag);

  if (affectedCommits.length === 0) {
    console.log(
      chalk.yellow(`\n  ⚠ No commits found between ${selectedTag} and HEAD. Nothing to roll back.\n`),
    );
    process.exit(0);
  }

  const strategyLabel =
    rollbackStrategy === "reset"
      ? chalk.yellow.bold("reset") + chalk.dim(" — rewrites history, force push will be needed")
      : chalk.green.bold("revert") + chalk.dim(" — creates a new commit, history preserved");

  console.log(
    "\n" +
    chalk.bold("  Commits that will be rolled back:") +
    "  " +
    chalk.dim(`(strategy: ${rollbackStrategy})`),
  );
  console.log(chalk.dim("  ─────────────────────────────────────────────"));
  for (const subject of affectedCommits) {
    console.log(chalk.dim("  · ") + subject);
  }
  console.log();
  console.log(`  Strategy  : ${strategyLabel}`);
  console.log(
    `  Target tag: ${chalk.cyan(selectedTag)}` +
    chalk.dim(` (${affectedCommits.length} commit(s) affected)`) +
    "\n",
  );

  if (!cli.yes) {
    const { confirmRollback } = await inquirer.prompt([{
      type: "confirm",
      name: "confirmRollback",
      message: chalk.yellow(
        rollbackStrategy === "reset"
          ? `Confirm reset to ${selectedTag}? This will rewrite history.`
          : `Confirm revert to ${selectedTag}? A new commit will be created.`,
      ),
      default: false,
    }]);
    if (!confirmRollback) {
      console.log(chalk.yellow("\n  Rollback cancelled.\n"));
      process.exit(0);
    }
  }

  if (dryRun) {
    console.log(
      chalk.dim(`\n  [dry-run] rollback to ${selectedTag} via ${rollbackStrategy} — not executed\n`),
    );
    process.exit(0);
  }

  const spinner = ora({
    text: rollbackStrategy === "reset"
      ? `Resetting to ${selectedTag}...`
      : `Reverting commits to ${selectedTag}...`,
    color: "yellow",
  }).start();

  try {
    if (rollbackStrategy === "reset") {
      vcs.rollbackToTag(selectedTag);
      spinner.succeed(chalk.green(`Reset to ${selectedTag} completed.`));
      console.log(chalk.dim("\n  The files have been reverted to the state of the tag."));
      if (vcs.supportsPush())
        console.log(chalk.yellow("  ⚠  History was rewritten — a force push will be needed.\n"));
      else console.log();
    } else {
      vcs.revertToTag(selectedTag);
      spinner.succeed(chalk.green(`Revert to ${selectedTag} completed.`));
      console.log(chalk.dim("\n  A new revert commit has been created. You can push normally.\n"));

      if (vcs.supportsPush()) {
        let doPush = cli.yes;
        if (!cli.yes) {
          const ans = await inquirer.prompt([{
            type: "confirm", name: "doPush",
            message: "Push the revert commit to the remote?",
            default: true,
          }]);
          doPush = ans.doPush;
        }
        if (doPush) {
          const pushSpinner = ora({ text: "Pushing...", color: "cyan" }).start();
          try {
            vcs.pushWithTags();
            pushSpinner.succeed(chalk.green("Pushed successfully."));
          } catch (pushErr) {
            pushSpinner.fail(chalk.red("Push failed."));
            printError(pushErr);
          }
        } else {
          console.log(chalk.dim("  Push skipped. Run git push when ready.\n"));
        }
      }
    }
  } catch (err) {
    spinner.fail(chalk.red("Error during rollback"));
    printError(err);
    process.exit(1);
  }

  if (rollbackStrategy === "reset") {
    const tagsAfter = vcs.getTagsAfter(selectedTag);
    if (tagsAfter.length > 0) {
      console.log(chalk.dim(`\n  Tags after ${selectedTag}:`));
      tagsAfter.forEach((t) => console.log(chalk.dim(`    · ${t}`)));
      console.log();

      let deleteTags = cli.yes;
      if (!cli.yes) {
        const ans = await inquirer.prompt([{
          type: "confirm", name: "deleteTags",
          message: chalk.yellow(`Delete these ${tagsAfter.length} tag(s)?`),
          default: false,
        }]);
        deleteTags = ans.deleteTags;
      }

      if (deleteTags) {
        const spinnerTags = ora({ text: "Deleting tags...", color: "yellow" }).start();
        try {
          for (const t of tagsAfter) vcs.deleteTag(t);
          spinnerTags.succeed(chalk.green(`${tagsAfter.length} tag(s) deleted.`));
        } catch (err) {
          spinnerTags.fail(chalk.red("Error deleting tags"));
          printError(err);
        }
      } else {
        console.log(chalk.dim("  Tags preserved.\n"));
      }
    }
  }
}
