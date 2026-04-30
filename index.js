#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("./package.json");
import chalk from "chalk";
import inquirer from "inquirer";
import { parseArgs, printHelp, printVersion } from "./lib/cli.js";
import { loadVitConfig } from "./lib/config.js";
import { getVcsAdapter, vcsLabel } from "./lib/vcs/index.js";
import { runInit } from "./lib/init.js";
import { printError, resolvePreReleaseBranch } from "./lib/commands/shared.js";

// ── Early exits (no config needed) ─────────────────────────────────────────────────────
const cli = parseArgs();
if (cli.command === "init") { runInit(); process.exit(0); }
if (cli.help)    { printHelp();    process.exit(0); }
if (cli.version) { printVersion(); process.exit(0); }

const dryRun = cli.dryRun;

// ── Boot ─────────────────────────────────────────────────────────────────────────────────
const config = loadVitConfig();
const vcs    = getVcsAdapter(config.vcs?.provider ?? "git");
const semanticChangelog = config.changelog?.semantic === true || cli.semantic === true;
const promoteStrategy   = config.git?.promoteStrategy ?? "merge";

console.log(
  "\n" +
  chalk.bgHex("#046c04").white.bold("  VIT  ") + "  " +
  chalk.hex("#046c04").bold("Version It!") + "  " +
  chalk.dim(`v${version}`) +
  (dryRun ? "  " + chalk.bgYellow.black.bold(" DRY-RUN ") : "") +
  "\n",
);

const branch  = vcs.getCurrentBranch();
const lastTag = vcs.getLastTag();

console.log(chalk.dim(`  VCS            : `) + chalk.cyan(vcsLabel(config.vcs?.provider)));
console.log(chalk.dim(`  Current branch : `) + chalk.cyan(branch ?? "-"));
if (lastTag)           console.log(chalk.dim(`  Last tag       : `) + chalk.cyan(lastTag));
if (semanticChangelog) console.log(chalk.dim(`  Changelog mode : `) + chalk.magenta("semantic — automatically generated from commits"));
if (dryRun)            console.log(chalk.dim(`  Mode           : `) + chalk.yellow.bold("dry-run — no files, commits, tags or pushes will be made"));
console.log();

// ── Resolve pre-release branch context ─────────────────────────────────────────────────
const { isOnPreReleaseBranch, preId } = resolvePreReleaseBranch(branch, config);

// ── Resolve command ───────────────────────────────────────────────────────────────────
let command = cli.command;

if (!command) {
  const choices = [
    { name: "🚀  Version it!  — bump + changelog + commit", value: "release" },
    { name: "📋  Changelog    — add or edit entries",        value: "changelog" },
    { name: "💾  Commit       — commit and push without bump", value: "commit" },
    ...(isOnPreReleaseBranch
      ? [{ name: "⏫  Promote      — " + (promoteStrategy === "pr" ? "open PR to" : "merge into") + " main + stable release", value: "promote" }]
      : []),
    { name: "🔄  Sync         — sync prerelease branches with main", value: "sync" },
    { name: "⏪  Rollback     — roll back to a tag",                   value: "rollback" },
    { name: "❌  Exit", value: "exit" },
  ];
  const answer = await inquirer.prompt([{
    type: "list", name: "command",
    message: "Welcome. What do you want to do?",
    choices,
  }]);
  command = answer.command;
} else if (!cli.yes) {
  console.log(chalk.dim(`  Command pre-selected: ${chalk.cyan(command)}\n`));
}

if (command === "exit") { console.log(chalk.dim("\n  Bye.\n")); process.exit(0); }

// ── Dispatch ──────────────────────────────────────────────────────────────────────────────
const ctx = { cli, config, vcs, dryRun, branch, isOnPreReleaseBranch, preId, semanticChangelog, promoteStrategy };

const handlers = {
  release:   () => import("./lib/commands/release.js"),
  rollback:  () => import("./lib/commands/rollback.js"),
  promote:   () => import("./lib/commands/promote.js"),
  commit:    () => import("./lib/commands/commit.js"),
  changelog: () => import("./lib/commands/changelog.js"),
  sync:      () => import("./lib/commands/sync.js"),
};

if (!handlers[command]) { process.exit(0); }

try {
  const { run } = await handlers[command]();
  await run(ctx);
} catch (err) {
  printError(err);
  process.exit(1);
}
