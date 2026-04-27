#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("./package.json");
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { bump, getNextVersion } from "./lib/bump.js";
import {
  buildChangelog,
  buildSemanticChangelog,
  editChangelog,
} from "./lib/changelog.js";
import { loadVitConfig, checkReleaseBranch } from "./lib/config.js";
import { getVcsAdapter, vcsLabel } from "./lib/vcs/index.js";
import { printPostActionsSummary, runPostActions } from "./lib/post-actions.js";
import { printPreActionsSummary, runPreActions } from "./lib/pre-actions.js";
import { parseArgs, printHelp, printVersion } from "./lib/cli.js";

// ── Parse CLI args ────────────────────────────────────────────────────────────
const cli = parseArgs();

if (cli.help) {
  printHelp();
  process.exit(0);
}
if (cli.version) {
  printVersion();
  process.exit(0);
}

const dryRun = cli.dryRun;

// ── Error log helper ──────────────────────────────────────────────────────────
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
      (err.original
        ? "\n         " + chalk.dim("└─ " + err.original.message)
        : "") +
      "\n\n" +
      chalk.dim("  Log guardado en:") +
      "\n" +
      chalk.cyan("  " + logFile) +
      "\n",
  );
}

// ── Boot banner ───────────────────────────────────────────────────────────────
const config = loadVitConfig();
const vcs = getVcsAdapter(config.vcs?.provider ?? "git");
const semanticChangelog = config.changelog?.semantic === true;

console.log(
  "\n" +
    chalk.bgHex("#046c04").white.bold("  VIT  ") +
    "  " +
    chalk.hex("#046c04").bold("Version It!") +
    "  " +
    chalk.dim(`v${version}`) +
    (dryRun ? "  " + chalk.bgYellow.black.bold(" DRY-RUN ") : "") +
    (cli.headless ? "  " + chalk.bgCyan.black.bold(" HEADLESS ") : "") +
    "\n",
);

const branch = vcs.getCurrentBranch();
const lastTag = vcs.getLastTag();

console.log(
  chalk.dim(`  VCS            : `) + chalk.cyan(vcsLabel(config.vcs?.provider)),
);
console.log(chalk.dim(`  Current branch : `) + chalk.cyan(branch ?? "-"));
if (lastTag)
  console.log(chalk.dim(`  Last tag       : `) + chalk.cyan(lastTag));
if (semanticChangelog)
  console.log(
    chalk.dim(`  Changelog mode : `) +
      chalk.magenta("semantic — full regeneration from git tags"),
  );
if (dryRun)
  console.log(
    chalk.dim(`  Mode           : `) +
      chalk.yellow.bold(
        "dry-run — no files, commits, tags or pushes will be made",
      ),
  );
if (cli.headless)
  console.log(
    chalk.dim(`  Mode           : `) +
      chalk.cyan.bold("headless — running without prompts"),
  );
console.log();

// ── Resolve action ────────────────────────────────────────────────────────────
let accion;

if (cli.headless) {
  accion = cli.command;
} else if (cli.command) {
  accion = cli.command;
  console.log(chalk.dim(`  Command pre-selected: ${chalk.cyan(accion)}\n`));
} else {
  const choices = [
    { name: "🚀  Version it!  — bump + changelog + commit", value: "release" },
    { name: "📋  Changelog    — add or edit entries", value: "changelog" },
    {
      name: "💾  Commit       — commit and push without bump",
      value: "commit",
    },
    { name: "⏪  Rollback     — roll back to a tag", value: "rollback" },
    { name: "❌  Exit", value: "exit" },
  ];

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "accion",
      message: "Welcome. What do you want to do?",
      choices,
    },
  ]);
  accion = answer.accion;
}

if (accion === "exit") {
  console.log(chalk.dim("\n  Bye.\n"));
  process.exit(0);
}

if (
  (accion === "commit" || accion === "rollback") &&
  !vcs.supportsVersioning()
) {
  console.log(
    chalk.yellow(
      `\n  ⚠ The current VCS (${vcsLabel(config.vcs?.provider)}) does not support this operation.\n`,
    ),
  );
  process.exit(0);
}

// ── Branch guard (release only) ───────────────────────────────────────────────
if (accion === "release" && branch) {
  const { allowed } = checkReleaseBranch(config.git.releaseBranches, branch);

  if (!allowed) {
    const allowed_list = config.git.releaseBranches.join(", ");

    if (config.git.strict && !dryRun) {
      console.log(
        "\n" +
          chalk.bgRed.white.bold("  BLOCKED  ") +
          "  " +
          chalk.red.bold(`Releases are not allowed from branch "${branch}".`) +
          "\n" +
          chalk.dim(`  Allowed branches: ${allowed_list}`) +
          "\n",
      );
      process.exit(1);
    } else {
      const isDryRunBypass = dryRun && config.git.strict;
      console.log(
        "\n" +
          chalk.bgYellow.black.bold("  WARNING  ") +
          "  " +
          chalk.yellow.bold(
            `You are on branch "${branch}", not on a release branch.`,
          ) +
          (isDryRunBypass ? chalk.dim(" (strict bypassed in dry-run)") : "") +
          "\n" +
          chalk.dim(`  Configured release branches: ${allowed_list}`) +
          "\n",
      );

      if (!dryRun && !cli.yes) {
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
      } else if (cli.yes && !dryRun) {
        console.log(
          chalk.dim(
            "  --yes flag detected, continuing despite branch warning.\n",
          ),
        );
      }
      console.log();
    }
  }
}

// ── Rollback ──────────────────────────────────────────────────────────────────
if (accion === "rollback") {
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
        chalk.red(
          `\n  ✖ Tag "${cli.tag}" not found. Available: ${tags.join(", ")}\n`,
        ),
      );
      process.exit(1);
    }
    console.log(chalk.dim(`  Tag: ${selectedTag}`));
  } else {
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "selectedTag",
        message: "Select the tag to rollback to:",
        choices: tags.map((t) => ({ name: t, value: t })),
        pageSize: 15,
      },
    ]);
    selectedTag = answer.selectedTag;
  }

  if (!cli.yes) {
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
  }

  if (dryRun) {
    console.log(
      chalk.dim(`\n  [dry-run] rollback to ${selectedTag} — not executed\n`),
    );
    process.exit(0);
  }

  const spinner = ora({
    text: "Executing rollback...",
    color: "yellow",
  }).start();
  try {
    vcs.rollbackToTag(selectedTag);
    spinner.succeed(chalk.green(`Rollback to ${selectedTag} completed.`));
    console.log(
      chalk.dim("\n  The files have been reverted to the state of the tag."),
    );
    if (vcs.supportsPush())
      console.log(
        chalk.dim(
          "  Use a force push if you need to upload the rollback to the remote.\n",
        ),
      );
    else console.log();
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

    let deleteTags = cli.yes;
    if (!cli.yes) {
      const ans = await inquirer.prompt([
        {
          type: "confirm",
          name: "deleteTags",
          message: chalk.yellow(`Delete these ${tagsAfter.length} tag(s)?`),
          default: false,
        },
      ]);
      deleteTags = ans.deleteTags;
    }

    if (deleteTags) {
      const spinnerTags = ora({
        text: "Deleting tags...",
        color: "yellow",
      }).start();
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

  process.exit(0);
}

// ── Release / Commit / Changelog ──────────────────────────────────────────────
let bumpResult = null;
let changelogDone = false;
let commitMessage = null;

if (accion === "release") {
  const configuredProjects = config.projects ?? [];
  if (configuredProjects.length === 0) {
    console.log(
      chalk.red("\n  ✖ No projects configured in vit-config.json.\n"),
    );
    process.exit(1);
  }

  let targets;

  if (cli.headless) {
    const ids = cli.projects ?? configuredProjects.map((p) => p.id);
    const invalid = ids.filter(
      (id) => !configuredProjects.find((p) => p.id === id),
    );
    if (invalid.length > 0) {
      console.log(
        chalk.red(`\n  ✖ Unknown project(s): ${invalid.join(", ")}\n`),
      );
      process.exit(1);
    }
    targets = ids;
    console.log(
      chalk.green(
        `\n  ✔ Projects : ${targets.join(", ")}\n  ✔ Bump     : ${cli.bump}\n`,
      ),
    );
  } else if (configuredProjects.length === 1) {
    targets = [configuredProjects[0].id];
    console.log(
      chalk.green(
        `\n  ✔ Project selected automatically: ${configuredProjects[0].label} (${configuredProjects[0].id})\n`,
      ),
    );
  } else {
    const projectChoices = [
      { name: "all — All configured projects", value: "__all__" },
      ...configuredProjects.map((p) => ({
        name: `${p.id} — ${p.label} (${p.path})`,
        value: p.id,
      })),
    ];
    const { targets: t } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "targets",
        message: "Which projects to bump?",
        choices: projectChoices,
        validate: (v) => v.length > 0 || "Select at least one",
      },
    ]);
    targets = t.includes("__all__") ? configuredProjects.map((p) => p.id) : t;
  }

  let bumpType;
  if (cli.bump) {
    const valid = ["patch", "minor", "major"];
    if (!valid.includes(cli.bump)) {
      console.log(
        chalk.red(
          `\n  ✖ Invalid bump type "${cli.bump}". Use: patch | minor | major\n`,
        ),
      );
      process.exit(1);
    }
    bumpType = cli.bump;
    if (!cli.headless)
      console.log(chalk.dim(`  Bump pre-selected: ${chalk.cyan(bumpType)}\n`));
  } else {
    const ans = await inquirer.prompt([
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
    bumpType = ans.bumpType;
  }

  bumpResult = { targets, bumpType };
  if (!cli.headless && !cli.bump)
    console.log(
      chalk.green(
        `\n  ✔ Bump configured: ${bumpType} → ${targets.join(", ")}\n`,
      ),
    );
}

// ── Changelog step ────────────────────────────────────────────────────────────
//
// SEMANTIC MODE  (semanticChangelog: true)
//   Always regenerates the FULL changelog from all git tags.
//   When called from a release flow, computes the pending tag from the current
//   version + bump type so that unreleased commits are included even though the
//   tag does not exist yet in the repository.
//   Interactive → preview first 80 lines → confirm overwrite.
//   Headless    → overwrites silently with no prompts.
//
// MANUAL MODE  (semanticChangelog: false, default)
//   Interactive → show add/edit menu (original behaviour).
//   Headless    → skip entirely.
//
if (accion === "release" || accion === "changelog") {
  if (semanticChangelog) {
    if (!dryRun) {
      // ── Compute pending tag for release flow ────────────────────────────
      // The changelog is built before the bump runs, so the new tag does not
      // exist yet. We derive it here so the upcoming release section is
      // included in the generated output.
      let pendingTag;
      if (accion === "release" && bumpResult) {
        try {
          const selectedProjects = config.projects.filter((p) =>
            bumpResult.targets.includes(p.id),
          );
          // Use the first target project to compute the pending version.
          // For multi-project monorepos the tag is a joined string; we build
          // it the same way bump.js does.
          const pendingVersions = selectedProjects.map((p) => {
            const pkg = JSON.parse(
              readFileSync(resolve(p.path, "package.json"), "utf-8"),
            );
            const nextVer = getNextVersion(pkg.version, bumpResult.bumpType);
            return `${p.tagPrefix}-${nextVer}`;
          });
          pendingTag = pendingVersions.join("-");
        } catch {
          // If we cannot read the version for any reason, fall back to no
          // pending tag (same behaviour as before this fix).
          pendingTag = undefined;
        }
      }

      const result = await buildSemanticChangelog(config, {
        headless: cli.headless,
        pendingTag,
      });
      changelogDone = result.saved;
    } else {
      console.log(
        chalk.dim(
          "  [dry-run] semantic changelog — would regenerate from all tags, not saved\n",
        ),
      );
    }
  } else {
    if (!cli.headless) {
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
        changelogDone = true;
      }
    }
  }
}

// ── Commit message ────────────────────────────────────────────────────────────
if (accion !== "changelog") {
  const defaultMsg =
    accion === "release"
      ? config.git.releaseCommitMessage
      : config.git.defaultCommitMessage;

  if (cli.headless || cli.yes) {
    commitMessage = cli.message ?? defaultMsg;
    if (!cli.headless)
      console.log(chalk.dim(`  Message: ${chalk.cyan(commitMessage)}\n`));
  } else if (cli.message) {
    commitMessage = cli.message;
    console.log(
      chalk.dim(`  Message pre-selected: ${chalk.cyan(commitMessage)}\n`),
    );
  } else {
    const { message } = await inquirer.prompt([
      {
        type: "input",
        name: "message",
        message: vcs.supportsCommit()
          ? "Commit message:"
          : "Descriptive message for the operation:",
        default: defaultMsg,
        validate: (v) => v.trim().length > 0 || "The message cannot be empty",
      },
    ]);
    commitMessage = message;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + chalk.bold("  Operation summary:"));
console.log(chalk.dim("  ─────────────────────────────"));
console.log(`  Action    : ${chalk.cyan(accion)}`);
console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
if (cli.headless) console.log(`  Mode      : ${chalk.cyan.bold("headless")}`);
if (bumpResult) {
  console.log(`  Targets   : ${chalk.cyan(bumpResult.targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan(bumpResult.bumpType)}`);
}
if (commitMessage) console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
console.log(
  `  Changelog : ${
    semanticChangelog
      ? changelogDone
        ? chalk.magenta("semantic — fully regenerated")
        : chalk.dim("semantic — skipped (dry-run)")
      : changelogDone
        ? chalk.green("manual — entry added")
        : chalk.dim("none")
  }`,
);

// this is a test
printPreActionsSummary(config, accion);
printPostActionsSummary(config, accion);
console.log();

// ── Confirm & Execute ─────────────────────────────────────────────────────────
if (accion === "changelog") {
  if (!vcs.supportsCommit()) {
    console.log(
      chalk.yellow(
        "\n  ⚠ VCS does not support commit/push. Changelog saved locally.\n",
      ),
    );
    process.exit(0);
  }

  if (dryRun) {
    console.log(chalk.dim("\n  [dry-run] changelog commit — not executed\n"));
    process.exit(0);
  }

  if (!cli.yes) {
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
  }

  if (!commitMessage) {
    commitMessage = cli.message ?? config.git.changelogCommitMessage;
    if (!cli.yes) {
      const { message } = await inquirer.prompt([
        {
          type: "input",
          name: "message",
          message: "Commit message:",
          default: commitMessage,
          validate: (v) => v.trim().length > 0 || "Cannot be empty",
        },
      ]);
      commitMessage = message;
    }
  }
} else {
  if (!cli.yes) {
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: dryRun
          ? "Run dry-run? (nothing will be written or pushed)"
          : "Confirm and execute?",
        default: true,
      },
    ]);
    if (!proceed) {
      console.log(chalk.yellow("\n  Operation cancelled.\n"));
      process.exit(0);
    }
  } else {
    console.log(chalk.dim("  Auto-confirmed via --yes.\n"));
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  await runPreActions(config, accion);
} catch (err) {
  printError(err);
  process.exit(1);
}

if (dryRun)
  console.log("\n" + chalk.bgYellow.black.bold("  DRY-RUN RESULTS  ") + "\n");

const spinner = ora({
  text: dryRun ? "Simulating..." : "Executing...",
  color: "yellow",
}).start();

try {
  if (accion === "release") {
    const result = await bump({
      targets: bumpResult.targets,
      bumpType: bumpResult.bumpType,
      message: commitMessage,
      config,
      vcs,
      dryRun,
    });

    spinner.succeed(
      dryRun
        ? chalk.yellow("Dry-run completed — no changes made.")
        : chalk.green("Bump completed successfully!"),
    );
    console.log();

    for (const item of result.bumpedProjects) {
      const prefix = dryRun ? chalk.dim("  [dry-run] ") : "  ";
      console.log(
        `${prefix}${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`,
      );
    }
    if (result.tag) {
      const prefix = dryRun ? chalk.dim("  [dry-run] Tag  ") : "  Tag         ";
      console.log(`${prefix}: ${chalk.cyan(result.tag)}`);
    }
  } else if (!dryRun) {
    vcs.addAll();
    vcs.commit(commitMessage);
    vcs.pushWithTags();
    spinner.succeed(chalk.green("Operation completed successfully"));
  } else {
    spinner.succeed(
      chalk.yellow(
        `Dry-run completed — commit "${commitMessage}" not executed.`,
      ),
    );
  }

  await runPostActions(config, accion);
} catch (err) {
  spinner.fail(chalk.red("Error during execution"));
  printError(err);
  process.exit(1);
}

if (dryRun) {
  console.log(
    "\n" +
      chalk.yellow.bold(
        "  ⚠  Dry-run finished. Nothing was written to disk, committed or pushed.",
      ) +
      "\n",
  );
}
