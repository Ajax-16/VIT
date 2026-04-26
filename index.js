#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("./package.json");
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { bump } from "./lib/bump.js";
import { buildChangelog, editChangelog } from "./lib/changelog.js";
import { loadVitConfig, shouldSimulate, checkReleaseBranch } from "./lib/config.js";
import { getVcsAdapter, vcsLabel } from "./lib/vcs/index.js";
import { printPostActionsSummary, runPostActions } from "./lib/post-actions.js";
import { printPreActionsSummary, runPreActions } from "./lib/pre-actions.js";
import { runSimulation } from "./lib/simulate.js";

function writeErrorLog(err) {
  const logDir = join(tmpdir(), "vit-logs");
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `vit-error-${Date.now()}.log`);
  const content = [
    `VIT Error Log — ${new Date().toISOString()}`,
    "─".repeat(50),
    "",
    `Message : ${err.message}`,
    err.original ? `Cause   : ${err.original.message}` : null,
    "",
    "Stack trace:",
    err.stack,
    err.original?.stack ? "\nOriginal stack:\n" + err.original.stack : null,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(logFile, content, "utf-8");
  return logFile;
}

function printError(err) {
  const logFile = writeErrorLog(err);
  console.error(
    "\n" +
    chalk.bgRed.white.bold("  ERROR  ") +
    "  " +
    chalk.red.bold(err.message) +
    (err.original ? "\n         " + chalk.dim("└─ " + err.original.message) : "") +
    "\n\n" +
    chalk.dim("  Log guardado en:") +
    "\n" +
    chalk.cyan("  " + logFile) +
    "\n"
  );
}

const config = loadVitConfig();
const vcs = getVcsAdapter(config.vcs?.provider ?? "git");

console.log(
  "\n" +
  chalk.bgHex("#046c04").white.bold("  VIT  ") +
  "  " +
  chalk.hex("#046c04").bold("Version It!") +
  "  " +
  chalk.dim(`v${version}`) +
  "\n",
);

const branch = vcs.getCurrentBranch();
const lastTag = vcs.getLastTag();

console.log(chalk.dim(`  VCS            : `) + chalk.cyan(vcsLabel(config.vcs?.provider)));
console.log(chalk.dim(`  Current branch : `) + chalk.cyan(branch ?? "-"));
if (lastTag) console.log(chalk.dim(`  Last tag       : `) + chalk.cyan(lastTag));
if (config.simulate) {
  const simTargets = config.simulate === true ? "all triggers" : config.simulate.join(", ");
  console.log(chalk.dim(`  Simulate       : `) + chalk.yellow(simTargets));
}
console.log();

const { accion } = await inquirer.prompt([
  {
    type: "list",
    name: "accion",
    message: "Welcome. What do you want to do?",
    choices: [
      { name: "\uD83D\uDE80  Version it!  — bump + changelog + commit", value: "release" },
      { name: "\uD83D\uDCCB  Changelog    — add or edit entries", value: "changelog" },
      { name: "\uD83D\uDCBE  Commit       — commit and push without bump", value: "commit" },
      { name: "\u23EA  Rollback     — roll back to a tag", value: "rollback" },
      { name: "\u274C  Exit", value: "exit" },
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
      `\n  \u26A0 The current VCS (${vcsLabel(config.vcs?.provider)}) does not support this operation.\n`,
    ),
  );
  process.exit(0);
}

// ── Branch guard (release only) ────────────────────────────────────────

if (accion === "release" && branch) {
  const { allowed, matched } = checkReleaseBranch(
    config.git.releaseBranches,
    branch
  );

  if (!allowed) {
    const allowed_list = config.git.releaseBranches.join(", ");

    if (config.git.strict) {
      // Hard block — no way to continue
      console.log(
        "\n" +
        chalk.bgRed.white.bold("  BLOCKED  ") +
        "  " +
        chalk.red.bold(`Releases are not allowed from branch "${branch}".`) +
        "\n" +
        chalk.dim(`  Allowed branches: ${allowed_list}`) +
        "\n"
      );
      process.exit(1);
    } else {
      // Soft warning — user can still proceed
      console.log(
        "\n" +
        chalk.bgYellow.black.bold("  WARNING  ") +
        "  " +
        chalk.yellow.bold(`You are on branch "${branch}", not on a release branch.`) +
        "\n" +
        chalk.dim(`  Configured release branches: ${allowed_list}`) +
        "\n" +
        chalk.dim("  Releases from feature branches are usually unintentional.") +
        "\n"
      );

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: chalk.yellow("Continue anyway?"),
          default: false,
        },
      ]);

      if (!continueAnyway) {
        console.log(chalk.yellow("\n  Release cancelled.\n"));
        process.exit(0);
      }

      console.log();
    }
  }
}

// ── Rollback ────────────────────────────────────────────────────────────────

if (accion === "rollback") {
  const tags = vcs.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow("\n  \u26A0 No tags available.\n"));
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
      message: chalk.yellow(`Confirm rollback to ${selectedTag}? This will modify the history.`),
      default: false,
    },
  ]);

  if (!confirmRollback) {
    console.log(chalk.yellow("\n  Rollback cancelled.\n"));
    process.exit(0);
  }

  const spinner = ora({ text: "Executing rollback...", color: "yellow" }).start();

  try {
    vcs.rollbackToTag(selectedTag);
    spinner.succeed(chalk.green(`Rollback to ${selectedTag} completed.`));
    console.log(chalk.dim("\n  The files have been reverted to the state of the tag."));

    if (vcs.supportsPush()) {
      console.log(chalk.dim("  Use a force push if you need to upload the rollback to the remote.\n"));
    } else {
      console.log();
    }
  } catch (err) {
    spinner.fail(chalk.red("Error during rollback"));
    printError(err);
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
        message: chalk.yellow(`Delete these ${tagsAfter.length} tag(s)?`),
        default: false,
      },
    ]);

    if (deleteTags) {
      const spinnerTags = ora({ text: "Deleting tags...", color: "yellow" }).start();

      try {
        for (const t of tagsAfter) {
          vcs.deleteTag(t);
        }
        spinnerTags.succeed(chalk.green(`${tagsAfter.length} tag(s) deleted.`));
      } catch (err) {
        spinnerTags.fail(chalk.red("Error deleting tags"));
        printError(err);
      }
    } else {
      console.log(chalk.dim("  Tags preserved.\n"));
    }
  }

  process.exit(0);
}

// ── Release / Commit / Changelog ────────────────────────────────────────────

let bumpResult = null;
let changelogAction = "none";
let commitMessage = null;

if (accion === "release") {
  const configuredProjects = config.projects ?? [];

  if (configuredProjects.length === 0) {
    console.log(chalk.red("\n  \u2716 No projects configured in vit-config.json.\n"));
    process.exit(1);
  }

  let targets;

  if (configuredProjects.length === 1) {
    targets = [configuredProjects[0].id];
    console.log(
      chalk.green(`\n  \u2714 Project selected automatically: ${configuredProjects[0].label} (${configuredProjects[0].id})\n`),
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
        validate: (value) => value.length > 0 || "You must select at least one project",
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

  bumpResult = { targets, bumpType };

  console.log(chalk.green(`\n  \u2714 Bump configured: ${bumpType} \u2192 ${targets.join(", ")}\n`));
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

// ── Summary ─────────────────────────────────────────────────────────────────

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

printPreActionsSummary(config, accion);
printPostActionsSummary(config, accion);
console.log();

// ── Simulation (before confirmation) ────────────────────────────────────────

if (shouldSimulate(config, accion)) {
  await runSimulation(config, accion);
}

// ── Confirm & Execute ────────────────────────────────────────────────────────

if (accion === "changelog") {
  const canCommit = vcs.supportsCommit();

  if (!canCommit) {
    console.log(
      chalk.yellow("\n  \u26A0 The current VCS provider does not support commit/push. The changelog will be saved locally.\n"),
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
    console.log(chalk.yellow("\n  Changelog saved locally. No commit.\n"));
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

// ── Run ──────────────────────────────────────────────────────────────────────

try {
  await runPreActions(config, accion);
} catch (err) {
  printError(err);
  process.exit(1);
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
      console.log(chalk.dim("  Note        : versions updated without commit/tag/push."));
    }
  } else {
    vcs.addAll();
    vcs.commit(commitMessage);
    vcs.pushWithTags();
    spinner.succeed(chalk.green("Operation completed successfully"));
  }

  await runPostActions(config, accion);

} catch (err) {
  spinner.fail(chalk.red("Error during execution"));
  printError(err);
  process.exit(1);
}
