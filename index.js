#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { bump } from "./lib/bump.js";
import { buildChangelog, editChangelog } from "./lib/changelog.js";
import { loadVitConfig } from "./lib/config.js";
import {
  getVcsAdapter,
  vcsLabel,
} from "./lib/vcs/index.js";

const config = loadVitConfig();
const vcs = getVcsAdapter(config.vcs?.provider ?? "git");

console.log(
  "\n" +
  chalk.bgHex("#046c04").white.bold("  VIT  ") +
  " " +
  chalk.hex("#046c04").bold("Version It!") +
  "\n",
);

const branch = vcs.getCurrentBranch();
const lastTag = vcs.getLastTag();

console.log(chalk.dim(`  VCS         : `) + chalk.cyan(vcsLabel(config.vcs?.provider)));
console.log(chalk.dim(`  Current branch : `) + chalk.cyan(branch ?? "-"));
if (lastTag) console.log(chalk.dim(`  Last tag  : `) + chalk.cyan(lastTag));
console.log();

const { accion } = await inquirer.prompt([
  {
    type: "list",
    name: "accion",
    message: "Welcome. What do you want to do?",
    choices: [
      {
        name: "🚀  Version it!  — bump + changelog + commit",
        value: "release",
      },
      {
        name: "📋  Changelog    — add or edit entries",
        value: "changelog",
      },
      { name: "💾  Commit       — commit and push without bump", value: "commit" },
      { name: "⏪  Rollback     — roll back to a tag", value: "rollback" },
      { name: "❌  Exit", value: "exit" },
    ],
  },
]);

if (accion === "exit") {
  console.log(chalk.dim("\n  Bye.\n"));
  process.exit(0);
}

if ((accion === "commit" || accion === "rollback") && !vcs.supportsVersioning()) {
  console.log(
    chalk.yellow(
      `\n  ⚠ The current VCS (${vcsLabel(config.vcs?.provider)}) does not support this operation.\n`,
    ),
  );
  process.exit(0);
}

if (accion === "rollback") {
  const tags = vcs.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow("\n  ⚠ No tags available.\n"));
    process.exit(0);
  }

  const { selectedTag } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTag",
      message: "Select the tag to rollback to:",
      choices: tags.map((t) => ({ name: t, value: t })),
      pageSize: 15,
    },
  ]);

  const { confirmRollback } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmRollback",
      message: chalk.yellow(
        `Confirm rollback to ${selectedTag}? This will modify the history.`,
      ),
      default: false,
    },
  ]);

  if (!confirmRollback) {
    console.log(chalk.yellow("\n  Rollback cancelled.\n"));
    process.exit(0);
  }

  const spinner = ora({
    text: "Executing rollback...",
    color: "yellow",
  }).start();

  try {
    vcs.rollbackToTag(selectedTag);
    spinner.succeed(chalk.green(`Rollback to ${selectedTag} completed.`));
    console.log(chalk.dim("\n  The files have been reverted to the state of the tag."));

    if (vcs.supportsPush()) {
      console.log(
        chalk.dim(
          "  Use a force push if you need to upload the rollback to the remote.\n",
        ),
      );
    } else {
      console.log();
    }
  } catch (err) {
    spinner.fail(chalk.red("Error during rollback"));
    console.error("\n" + chalk.red(err.message) + "\n");
    process.exit(1);
  }

  const tagsAfter = vcs.getTagsAfter(selectedTag);

  if (tagsAfter.length > 0) {
    console.log(chalk.dim(`\n  Tags after ${selectedTag}:`));
    tagsAfter.forEach((t) => console.log(chalk.dim(`    · ${t}`)));
    console.log();

    const { deleteTags } = await inquirer.prompt([
      {
        type: "confirm",
        name: "deleteTags",
        message: chalk.yellow(
          `Delete these ${tagsAfter.length} tag(s)?`
        ),
        default: false,
      },
    ]);

    if (deleteTags) {
      const spinnerTags = ora({
        text: "Deleting tags...",
        color: "yellow",
      }).start();

      try {
        for (const t of tagsAfter) {
          vcs.deleteTag(t);
        }
        spinnerTags.succeed(
          chalk.green(`${tagsAfter.length} tag(s) deleted.`),
        );
      } catch (err) {
        spinnerTags.fail(chalk.red("Error deleting tags"));
        console.error("\n" + chalk.red(err.message) + "\n");
      }
    } else {
      console.log(chalk.dim("  Tags preserved.\n"));
    }
  }

  process.exit(0);
}

let bumpResult = null;
let changelogAction = "none";
let commitMessage = null;

if (accion === "release") {
  const configuredProjects = config.projects ?? [];

  if (configuredProjects.length === 0) {
    console.log(chalk.red("\n  ✖ No projects configured in vit-config.json.\n"));
    process.exit(1);
  }

  let targets;

  if (configuredProjects.length === 1) {
    targets = [configuredProjects[0].id];
    console.log(
      chalk.green(
        `\n  ✔ Project selected automatically: ${configuredProjects[0].label} (${configuredProjects[0].id})\n`,
      ),
    );
  } else {
    const projectChoices = [
      { name: "all — All configured projects", value: "__all__" },
      ...configuredProjects.map((project) => ({
        name: `${project.id} — ${project.label} (${project.path})`,
        value: project.id,
      })),
    ];

    const bumpAnswers = await inquirer.prompt([
      {
        type: "checkbox",
        name: "targets",
        message: "Which projects to bump?",
        choices: projectChoices,
        validate: (value) =>
          value.length > 0 || "You must select at least one project",
      },
    ]);

    targets = bumpAnswers.targets.includes("__all__")
      ? configuredProjects.map((p) => p.id)
      : bumpAnswers.targets;
  }

  const { bumpType } = await inquirer.prompt([
    {
      type: "list",
      name: "bumpType",
      message: "What type of bump?",
      choices: [
        { name: "patch — Minor correction    (x.x.+1)", value: "patch" },
        { name: "minor — New functionality  (x.+1.0)", value: "minor" },
        { name: "major — Major change        (+1.0.0)", value: "major" },
      ],
      default: "patch",
    },
  ]);

  bumpResult = {
    targets,
    bumpType,
  };

  console.log(
    chalk.green(
      `\n  ✔ Bump configured: ${bumpType} → ${targets.join(", ")}\n`,
    ),
  );
}

if (accion === "release" || accion === "changelog") {
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What to do with the changelog?",
        choices: [
          { name: "Do nothing", value: "none" },
          { name: "Add new entry", value: "add" },
          { name: "Edit existing version", value: "edit" },
        ],
        default: "none",
      },
    ]);

    if (action === "none") break;
    if (action === "add") await buildChangelog(config);
    if (action === "edit") await editChangelog(config);

    changelogAction = action;
  }
}

if (accion !== "changelog") {
  const defaultMessage =
    accion === "release"
      ? config.git.releaseCommitMessage
      : config.git.defaultCommitMessage;

  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: vcs.supportsCommit()
        ? "Commit message:"
        : "Descriptive message for the operation:",
      default: defaultMessage,
      validate: (v) => v.trim().length > 0 || "The message cannot be empty",
    },
  ]);
  commitMessage = message;
}

console.log("\n" + chalk.bold("  Operation summary:"));
console.log(chalk.dim("  ─────────────────────────"));
console.log(`  Action    : ${chalk.cyan(accion)}`);
console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
if (bumpResult) {
  console.log(`  Targets   : ${chalk.cyan(bumpResult.targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan(bumpResult.bumpType)}`);
}
if (commitMessage) {
  console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
}
console.log(
  `  Changelog : ${changelogAction === "add"
    ? chalk.green("new entry")
    : changelogAction === "edit"
      ? chalk.yellow("edit existing")
      : chalk.dim("no")
  }`,
);
console.log();

if (accion === "changelog") {
  const canCommit = vcs.supportsCommit();

  if (!canCommit) {
    console.log(
      chalk.yellow(
        "\n  ⚠ The current VCS provider does not support commit/push. The changelog will be saved locally.\n",
      ),
    );
    process.exit(0);
  }

  const { doCommit } = await inquirer.prompt([
    {
      type: "confirm",
      name: "doCommit",
      message: "Make commit and push of the changelog?",
      default: true,
    },
  ]);

  if (!doCommit) {
    console.log(
      chalk.yellow("\n  Changelog saved locally. No commit.\n"),
    );
    process.exit(0);
  }

  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: "Commit message:",
      default: config.git.changelogCommitMessage,
      validate: (v) => v.trim().length > 0 || "The message cannot be empty",
    },
  ]);
  commitMessage = message;
} else {
  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Confirm and execute?",
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("\n  Operation cancelled.\n"));
    process.exit(0);
  }
}

const spinner = ora({ text: "Executing...", color: "yellow" }).start();

try {
  if (accion === "release") {
    const result = await bump({
      targets: bumpResult.targets,
      bumpType: bumpResult.bumpType,
      message: commitMessage,
      config,
      vcs,
    });

    spinner.succeed(chalk.green("Bump completed successfully!"));
    console.log();

    for (const item of result.bumpedProjects) {
      console.log(`  ${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`);
    }

    if (result.tag) {
      console.log(`  Tag         : ${chalk.cyan(result.tag)}`);
    }

    if (!vcs.supportsVersioning()) {
      console.log(
        chalk.dim("  Note        : versions updated without commit/tag/push."),
      );
    }
  } else {
    vcs.addAll();
    vcs.commit(commitMessage);
    vcs.pushWithTags();
    spinner.succeed(chalk.green("Operation completed successfully"));
  }

  console.log();
} catch (err) {
  spinner.fail(chalk.red("Error during execution"));
  console.error("\n" + chalk.red(err.message));
  if (err.original)
    console.error(chalk.dim("  Original cause: " + err.original.message));
  console.error(chalk.dim("\n" + err.stack) + "\n");
  process.exit(1);
}