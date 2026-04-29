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
import { bump, getNextVersion, resolveActionsTrigger } from "./lib/bump.js";
import { runChangelog, editChangelog } from "./lib/changelog.js";
import { loadVitConfig, checkReleaseBranch } from "./lib/config.js";
import { getVcsAdapter, vcsLabel } from "./lib/vcs/index.js";
import { printPostActionsSummary, runPostActions } from "./lib/post-actions.js";
import { printPreActionsSummary, runPreActions } from "./lib/pre-actions.js";
import { parseArgs, printHelp, printVersion } from "./lib/cli.js";
import { runInit } from "./lib/init.js";
import { promoteMerge, promotePr } from "./lib/promote.js";
import { runSync } from "./lib/sync.js";
import semver from "semver";

// ── Parse CLI args ──────────────────────────────────────────────────────────────────────
const cli = parseArgs();

if (cli.command === "init") {
  runInit();
  process.exit(0);
}

if (cli.help) {
  printHelp();
  process.exit(0);
}
if (cli.version) {
  printVersion();
  process.exit(0);
}

const dryRun = cli.dryRun;

// ── Error log helper ────────────────────────────────────────────────────────────────────
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

// ── Boot banner ───────────────────────────────────────────────────────────────────────────
const config = loadVitConfig();
const vcs = getVcsAdapter(config.vcs?.provider ?? "git");
const semanticChangelog =
  config.changelog?.semantic === true || cli.semantic === true;
const rollbackStrategy = config.git?.rollbackStrategy ?? "revert";
const promoteStrategy = config.git?.promoteStrategy ?? "merge";

console.log(
  "\n" +
  chalk.bgHex("#046c04").white.bold("  VIT  ") +
  "  " +
  chalk.hex("#046c04").bold("Version It!") +
  "  " +
  chalk.dim(`v${version}`) +
  (dryRun ? "  " + chalk.bgYellow.black.bold(" DRY-RUN ") : "") +
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
    chalk.magenta("semantic — automatically generated from commits"),
  );
if (dryRun)
  console.log(
    chalk.dim(`  Mode           : `) +
    chalk.yellow.bold(
      "dry-run — no files, commits, tags or pushes will be made",
    ),
  );
console.log();

// ── sync ───────────────────────────────────────────────────────────────────────────────────
if (cli.command === "sync") {
  try {
    await runSync({ config, vcs, dryRun });
  } catch (err) {
    printError(err);
    process.exit(1);
  }
  process.exit(0);
}

// ── Detect if current branch is a prerelease branch ──────────────────────────────────
const preReleaseBranches = config.git?.preReleaseBranches ?? [];

function matchesPreReleaseBranch(b) {
  return (
    preReleaseBranches.find((pattern) => {
      const name = typeof pattern === "string" ? pattern : pattern?.name;
      if (!name) return false;
      const escaped = name
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(b);
    }) ?? null
  );
}

const matchedPreReleaseBranch = branch ? matchesPreReleaseBranch(branch) : null;
const isOnPreReleaseBranch = matchedPreReleaseBranch !== null;

const preId = isOnPreReleaseBranch
  ? typeof matchedPreReleaseBranch === "string"
    ? matchedPreReleaseBranch
    : String(matchedPreReleaseBranch?.id ?? matchedPreReleaseBranch?.name ?? "pre")
  : null;

// ── Resolve action ─────────────────────────────────────────────────────────────────────────
let accion;

if (cli.yes && cli.command) {
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
    ...(isOnPreReleaseBranch
      ? [
        {
          name:
            "⏫  Promote      — " +
            (promoteStrategy === "pr" ? "open PR to" : "merge into") +
            " main + stable release",
          value: "promote",
        },
      ]
      : []),
    { name: "🔄  Sync         — sync prerelease branches with main", value: "sync" },
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

if (accion === "sync") {
  try {
    await runSync({ config, vcs, dryRun });
  } catch (err) {
    printError(err);
    process.exit(1);
  }
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

// ── Branch guard (release only) ───────────────────────────────────────────────────────────────
if (accion === "release" && branch) {
  if (isOnPreReleaseBranch) {
    if (cli.bump && !["prepatch", "preminor", "premajor", "prerelease"].includes(cli.bump)) {
      console.log(
        "\n" +
        chalk.bgRed.white.bold("  BLOCKED  ") +
        "  " +
        chalk.red.bold(
          `You are on a pre-release branch ("${branch}"). --bump ${cli.bump} is not allowed here.`,
        ) +
        "\n" +
        chalk.dim(
          `  Valid options from this branch: prepatch | preminor | premajor | prerelease`,
        ) +
        "\n" +
        chalk.dim(
          `  To do a stable release, use "vit promote" instead.`,
        ) +
        "\n",
      );
      process.exit(1);
    }
  } else {
    const { allowed } = checkReleaseBranch(config.git.releaseBranches, branch);

    if (!allowed) {
      const allowed_list = config.git.releaseBranches.join(", ");

      if (config.git.strict && !dryRun) {
        console.log(
          "\n" +
          chalk.bgRed.white.bold("  BLOCKED  ") +
          "  " +
          chalk.red.bold(
            `Releases are not allowed from branch "${branch}".`,
          ) +
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
}

// ── Promote guard ────────────────────────────────────────────────────────────────────────
if (accion === "promote") {
  if (!isOnPreReleaseBranch) {
    console.log(
      "\n" +
      chalk.bgRed.white.bold("  BLOCKED  ") +
      "  " +
      chalk.red.bold(`"promote" is only available from a prerelease branch.`) +
      "\n" +
      chalk.dim(
        `  Current branch "${branch}" is not listed in preReleaseBranches.`,
      ) +
      "\n" +
      chalk.dim(`  Switch to a prerelease branch before running promote.`) +
      "\n",
    );
    process.exit(1);
  }
}

// ── Rollback ──────────────────────────────────────────────────────────────────────────────────
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

  const affectedCommits = vcs.getCommitsBetweenTagAndHead(selectedTag);

  if (affectedCommits.length === 0) {
    console.log(
      chalk.yellow(
        `\n  ⚠ No commits found between ${selectedTag} and HEAD. Nothing to roll back.\n`,
      ),
    );
    process.exit(0);
  }

  const strategyLabel =
    rollbackStrategy === "reset"
      ? chalk.yellow.bold("reset") +
      chalk.dim(" — rewrites history, force push will be needed")
      : chalk.green.bold("revert") +
      chalk.dim(" — creates a new commit, history preserved");

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
    const { confirmRollback } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmRollback",
        message: chalk.yellow(
          rollbackStrategy === "reset"
            ? `Confirm reset to ${selectedTag}? This will rewrite history.`
            : `Confirm revert to ${selectedTag}? A new commit will be created.`,
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
      chalk.dim(
        `\n  [dry-run] rollback to ${selectedTag} via ${rollbackStrategy} — not executed\n`,
      ),
    );
    process.exit(0);
  }

  const spinner = ora({
    text:
      rollbackStrategy === "reset"
        ? `Resetting to ${selectedTag}...`
        : `Reverting commits to ${selectedTag}...`,
    color: "yellow",
  }).start();

  try {
    if (rollbackStrategy === "reset") {
      vcs.rollbackToTag(selectedTag);
      spinner.succeed(chalk.green(`Reset to ${selectedTag} completed.`));
      console.log(
        chalk.dim("\n  The files have been reverted to the state of the tag."),
      );
      if (vcs.supportsPush())
        console.log(
          chalk.yellow(
            "  ⚠  History was rewritten — a force push will be needed.\n",
          ),
        );
      else console.log();
    } else {
      vcs.revertToTag(selectedTag);
      spinner.succeed(chalk.green(`Revert to ${selectedTag} completed.`));
      console.log(
        chalk.dim(
          "\n  A new revert commit has been created. You can push normally.\n",
        ),
      );

      if (vcs.supportsPush()) {
        let doPush = cli.yes;
        if (!cli.yes) {
          const ans = await inquirer.prompt([
            {
              type: "confirm",
              name: "doPush",
              message: "Push the revert commit to the remote?",
              default: true,
            },
          ]);
          doPush = ans.doPush;
        }
        if (doPush) {
          const pushSpinner = ora({
            text: "Pushing...",
            color: "cyan",
          }).start();
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
          spinnerTags.succeed(
            chalk.green(`${tagsAfter.length} tag(s) deleted.`),
          );
        } catch (err) {
          spinnerTags.fail(chalk.red("Error deleting tags"));
          printError(err);
        }
      } else {
        console.log(chalk.dim("  Tags preserved.\n"));
      }
    }
  }

  process.exit(0);
}

// ── Release / Commit / Changelog / Promote ───────────────────────────────────────────────────
let bumpResult = null;
let changelogDone = false;
let commitMessage = null;

if (accion === "release" || accion === "promote") {
  const configuredProjects = config.projects ?? [];
  if (configuredProjects.length === 0) {
    console.log(
      chalk.red("\n  ✖ No projects configured in vit-config.json.\n"),
    );
    process.exit(1);
  }

  let targets;

  if (cli.yes) {
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
      chalk.green(`\n  ✔ Projects : ${targets.join(", ")}\n`),
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

  // ── Bump type ──────────────────────────────────────────────────────────────────
  let bumpType;

  if (accion === "promote") {
    bumpType = "promote";
    const sample = configuredProjects.find((p) => targets.includes(p.id));
    if (sample) {
      try {
        const pkg = JSON.parse(
          readFileSync(resolve(sample.path, "package.json"), "utf-8"),
        );
        const stableVer = getNextVersion(pkg.version, "promote");
        console.log(
          chalk.dim(
            `  Promote: ${chalk.cyan(pkg.version)} → ${chalk.green(stableVer)} (suffix stripped)\n`,
          ),
        );
      } catch { /* non-fatal */ }
    }
    bumpResult = { targets, bumpType, preId: null };
  } else {
    if (isOnPreReleaseBranch) {
      let isFirstPrerelease = true;
      const sample = configuredProjects.find((p) => targets.includes(p.id));
      if (sample && preId) {
        try {
          const pkg = JSON.parse(
            readFileSync(resolve(sample.path, "package.json"), "utf-8"),
          );
          const parsed = semver.parse(pkg.version);
          isFirstPrerelease =
            !parsed ||
            parsed.prerelease.length === 0 ||
            !parsed.prerelease.some((part) => String(part) === preId);
        } catch { /* non-fatal */ }
      }

      if (cli.bump) {
        const validPre = ["prepatch", "preminor", "premajor", "prerelease"];
        if (!validPre.includes(cli.bump)) {
          console.log(
            chalk.red(
              `\n  ✖ Invalid bump "${cli.bump}" on prerelease branch. Use: prepatch | preminor | premajor | prerelease\n`,
            ),
          );
          process.exit(1);
        }
        bumpType = cli.bump;
        if (!cli.yes)
          console.log(chalk.dim(`  Bump pre-selected: ${chalk.cyan(bumpType)}\n`));
      } else if (isFirstPrerelease) {
        console.log(
          chalk.dim(
            `  Pre-release branch ("${branch}"): choose the magnitude of the upcoming stable release.\n`,
          ),
        );
        const ans = await inquirer.prompt([
          {
            type: "list",
            name: "bumpType",
            message: "What magnitude will the final stable release be?",
            choices: [
              {
                name: `prepatch — anticipates a patch  (x.x.+1-${preId}.0)`,
                value: "prepatch",
              },
              {
                name: `preminor — anticipates a minor  (x.+1.0-${preId}.0)`,
                value: "preminor",
              },
              {
                name: `premajor — anticipates a major  (+1.0.0-${preId}.0)`,
                value: "premajor",
              },
            ],
            default: "preminor",
          },
        ]);
        bumpType = ans.bumpType;
      } else {
        bumpType = "prerelease";
        console.log(
          chalk.dim(
            `  Pre-release branch ("${branch}"): iterating prerelease → bump forced to ${chalk.cyan("prerelease")}\n`,
          ),
        );
      }
    } else {
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
        if (!cli.yes)
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
    }

    bumpResult = { targets, bumpType, preId };
    if (!cli.yes && accion === "release" && !isOnPreReleaseBranch && !cli.bump)
      console.log(
        chalk.green(
          `\n  ✔ Bump configured: ${bumpType} → ${targets.join(", ")}\n`,
        ),
      );
  }
}

// ── Changelog step ──────────────────────────────────────────────────────────────────────────
async function runChangelogStep(currentBumpResult) {
  if (dryRun) {
    console.log(
      chalk.dim(
        semanticChangelog
          ? "  [dry-run] semantic changelog — would regenerate from all tags, not saved\n"
          : "  [dry-run] changelog — skipped in dry-run\n",
      ),
    );
    return false;
  }

  // promote with --yes always skips changelog unless --semantic is explicit
  if (accion === "promote" && cli.yes && !cli.semantic) {
    return false;
  }

  let pendingTag;
  if ((accion === "release" || accion === "promote") && currentBumpResult) {
    try {
      const selectedProjects = config.projects.filter((p) =>
        currentBumpResult.targets.includes(p.id),
      );
      const pendingVersions = selectedProjects.map((p) => {
        const pkg = JSON.parse(
          readFileSync(resolve(p.path, "package.json"), "utf-8"),
        );
        const nextVer = getNextVersion(
          pkg.version,
          currentBumpResult.bumpType,
          currentBumpResult.preId,
        );
        return `${p.tagPrefix}-${nextVer}`;
      });
      pendingTag = pendingVersions.join("-");
    } catch {
      pendingTag = undefined;
    }
  }

  let skipChangelog = false;

  if (!semanticChangelog && !cli.yes) {
    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What to do with the changelog?",
          choices: [
            { name: "Nothing", value: "none" },
            { name: "Add new entry", value: "add" },
            { name: "Edit existing version", value: "edit" },
          ],
          default: "none",
        },
      ]);

      if (action === "none") {
        skipChangelog = true;
        break;
      }
      if (action === "edit") {
        await editChangelog(config);
        return true;
      }
      break;
    }
  }

  if (skipChangelog) return false;

  // --yes without --semantic: skip changelog silently
  if (cli.yes && !cli.semantic) return false;

  const result = await runChangelog(config, {
    yes: cli.yes,
    pendingTag,
    semanticChangelog: cli.semantic,
  });
  return result?.saved === true;
}

const isPreIteration =
  bumpResult?.bumpType === "prerelease" ||
  bumpResult?.bumpType === "prepatch" ||
  bumpResult?.bumpType === "preminor" ||
  bumpResult?.bumpType === "premajor";

if (
  (accion === "release" || accion === "changelog" || accion === "promote") &&
  !isPreIteration
) {
  changelogDone = await runChangelogStep(bumpResult);
}

// ── Commit message ───────────────────────────────────────────────────────────────────────────
if (accion !== "changelog") {
  const defaultMsg =
    accion === "release" || accion === "promote"
      ? config.git.releaseCommitMessage
      : config.git.defaultCommitMessage;

  if (cli.yes) {
    commitMessage = cli.message ?? defaultMsg;
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

// ── Resolve the actions trigger based on bumpType ────────────────────────────────────────
// accion "release" can be either a prerelease or a stable release depending on bumpType.
// accion "promote" and "commit" always map to "release" and "commit" respectively.
const actionsTrigger =
  accion === "release" && bumpResult
    ? resolveActionsTrigger(bumpResult.bumpType)
    : accion === "promote"
      ? "release"
      : accion; // "commit" | "changelog"

// ── Summary ────────────────────────────────────────────────────────────────────────────────────
console.log("\n" + chalk.bold("  Operation summary:"));
console.log(chalk.dim("  ─────────────────────────────"));
console.log(`  Action    : ${chalk.cyan(accion)}`);
console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
if (bumpResult) {
  console.log(`  Targets   : ${chalk.cyan(bumpResult.targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan(bumpResult.bumpType)}`);
}
if (accion === "promote") {
  const targetBranch = cli.target ?? config.git.releaseBranches?.[0] ?? "main";
  console.log(
    `  Promote   : ${chalk.cyan(branch)} → ${chalk.cyan(targetBranch)}  ` +
    chalk.dim(`[strategy: ${promoteStrategy}]`),
  );
}
if (commitMessage) console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
console.log(
  `  Changelog : ${isPreIteration
    ? chalk.dim("skipped (prerelease iteration)")
    : semanticChangelog
      ? changelogDone
        ? chalk.magenta("semantic — automatically generated")
        : chalk.dim("semantic — skipped")
      : changelogDone
        ? chalk.green("manual — entry added")
        : chalk.dim("none")
  }`,
);

printPreActionsSummary(config, actionsTrigger);
printPostActionsSummary(config, actionsTrigger);
console.log();

// ── Confirm & Execute ───────────────────────────────────────────────────────────────────────────
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

// ── Run ─────────────────────────────────────────────────────────────────────────────────────
try {
  await runPreActions(config, actionsTrigger);
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
      preId: bumpResult.preId,
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
  } else if (accion === "promote") {
    const targetBranch = cli.target ?? config.git.releaseBranches?.[0] ?? "main";
    const promoteArgs = {
      branch,
      targetBranch,
      bumpResult,
      commitMessage,
      config,
      vcs,
      dryRun,
      spinner,
    };

    const result =
      promoteStrategy === "pr"
        ? await promotePr(promoteArgs)
        : await promoteMerge(promoteArgs);

    if (!dryRun) {
      console.log();
      for (const item of result.bumpedProjects ?? []) {
        console.log(
          `  ${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`,
        );
      }
      if (result.tag) {
        console.log(`  Tag         : ${chalk.cyan(result.tag)}`);
      }
      if (result.prUrl) {
        console.log(
          `  PR          : ${chalk.cyan.underline(result.prUrl)}`,
        );
      }
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

  await runPostActions(config, actionsTrigger);
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
