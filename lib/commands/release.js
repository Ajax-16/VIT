import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import semver from "semver";
import { bump, resolveActionsTrigger } from "../bump.js";
import { checkReleaseBranch } from "../config.js";
import { vcsLabel } from "../vcs/index.js";
import { printPreActionsSummary, runPreActions } from "../pre-actions.js";
import { printPostActionsSummary, runPostActions } from "../post-actions.js";
import { printError, runChangelogStep, resolveCommitMessage, resolveTargets } from "./shared.js";

export async function run({ cli, config, vcs, dryRun, branch, isOnPreReleaseBranch, preId, semanticChangelog }) {

  // ── Branch guard ──────────────────────────────────────────────────────────────────
  if (branch) {
    if (isOnPreReleaseBranch) {
      if (cli.bump && !["prepatch", "preminor", "premajor", "prerelease"].includes(cli.bump)) {
        console.log(
          "\n" + chalk.bgRed.white.bold("  BLOCKED  ") + "  " +
          chalk.red.bold(`You are on a pre-release branch ("${branch}"). --bump ${cli.bump} is not allowed here.`) +
          "\n" + chalk.dim(`  Valid options from this branch: prepatch | preminor | premajor | prerelease`) +
          "\n" + chalk.dim(`  To do a stable release, use "vit promote" instead.`) + "\n",
        );
        process.exit(1);
      }
    } else {
      const { allowed } = checkReleaseBranch(config.git.releaseBranches, branch);
      if (!allowed) {
        const allowed_list = config.git.releaseBranches.join(", ");
        if (config.git.strict && !dryRun) {
          console.log(
            "\n" + chalk.bgRed.white.bold("  BLOCKED  ") + "  " +
            chalk.red.bold(`Releases are not allowed from branch "${branch}".`) +
            "\n" + chalk.dim(`  Allowed branches: ${allowed_list}`) + "\n",
          );
          process.exit(1);
        } else {
          const isDryRunBypass = dryRun && config.git.strict;
          console.log(
            "\n" + chalk.bgYellow.black.bold("  WARNING  ") + "  " +
            chalk.yellow.bold(`You are on branch "${branch}", not on a release branch.`) +
            (isDryRunBypass ? chalk.dim(" (strict bypassed in dry-run)") : "") +
            "\n" + chalk.dim(`  Configured release branches: ${allowed_list}`) + "\n",
          );
          if (!dryRun && !cli.yes) {
            const { continueAnyway } = await inquirer.prompt([{
              type: "confirm", name: "continueAnyway",
              message: chalk.yellow("Continue anyway?"), default: false,
            }]);
            if (!continueAnyway) { console.log(chalk.yellow("\n  Release cancelled.\n")); process.exit(0); }
          } else if (cli.yes && !dryRun) {
            console.log(chalk.dim("  --yes flag detected, continuing despite branch warning.\n"));
          }
          console.log();
        }
      }
    }
  }

  // ── Select targets ─────────────────────────────────────────────────────────────────
  const targets = await resolveTargets({ cli, config });

  // ── Resolve bump type ─────────────────────────────────────────────────────────────────
  let bumpType;

  if (isOnPreReleaseBranch) {
    let isFirstPrerelease = true;
    const sample = (config.projects ?? []).find((p) => targets.includes(p.id));
    if (sample && preId) {
      try {
        const pkg = JSON.parse(readFileSync(resolve(sample.path, "package.json"), "utf-8"));
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
        console.log(chalk.red(`\n  ✖ Invalid bump "${cli.bump}" on prerelease branch. Use: prepatch | preminor | premajor | prerelease\n`));
        process.exit(1);
      }
      bumpType = cli.bump;
      if (!cli.yes) console.log(chalk.dim(`  Bump pre-selected: ${chalk.cyan(bumpType)}\n`));
    } else if (isFirstPrerelease) {
      console.log(chalk.dim(`  Pre-release branch ("${branch}"): choose the magnitude of the upcoming stable release.\n`));
      const ans = await inquirer.prompt([{
        type: "list", name: "bumpType",
        message: "What magnitude will the final stable release be?",
        choices: [
          { name: `prepatch — anticipates a patch  (x.x.+1-${preId}.0)`, value: "prepatch" },
          { name: `preminor — anticipates a minor  (x.+1.0-${preId}.0)`, value: "preminor" },
          { name: `premajor — anticipates a major  (+1.0.0-${preId}.0)`, value: "premajor" },
        ],
        default: "preminor",
      }]);
      bumpType = ans.bumpType;
    } else {
      bumpType = "prerelease";
      console.log(chalk.dim(`  Pre-release branch ("${branch}"): iterating prerelease → bump forced to ${chalk.cyan("prerelease")}\n`));
    }
  } else {
    if (cli.bump) {
      const valid = ["patch", "minor", "major"];
      if (!valid.includes(cli.bump)) {
        console.log(chalk.red(`\n  ✖ Invalid bump type "${cli.bump}". Use: patch | minor | major\n`));
        process.exit(1);
      }
      bumpType = cli.bump;
      if (!cli.yes) console.log(chalk.dim(`  Bump pre-selected: ${chalk.cyan(bumpType)}\n`));
    } else {
      const ans = await inquirer.prompt([{
        type: "list", name: "bumpType",
        message: "What type of bump?",
        choices: [
          { name: "patch — Minor correction    (x.x.+1)", value: "patch" },
          { name: "minor — New functionality   (x.+1.0)", value: "minor" },
          { name: "major — Major change        (+1.0.0)", value: "major" },
        ],
        default: "patch",
      }]);
      bumpType = ans.bumpType;
    }
    if (!cli.yes && !cli.bump)
      console.log(chalk.green(`\n  ✔ Bump configured: ${bumpType} → ${targets.join(", ")}\n`));
  }

  const bumpResult = { targets, bumpType, preId };

  // ── Changelog ─────────────────────────────────────────────────────────────────────────
  const isPreIteration = ["prerelease", "prepatch", "preminor", "premajor"].includes(bumpType);
  let changelogDone = false;
  if (!isPreIteration) {
    changelogDone = await runChangelogStep({ cli, config, dryRun, accion: "release", bumpResult, semanticChangelog });
  }

  // ── Commit message ──────────────────────────────────────────────────────────────────
  const commitMessage = await resolveCommitMessage({ cli, config, vcs, accion: "release" });
  const actionsTrigger = resolveActionsTrigger(bumpType);

  // ── Summary ──────────────────────────────────────────────────────────────────────────
  console.log("\n" + chalk.bold("  Operation summary:"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(`  Action    : ${chalk.cyan("release")}`);
  console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
  if (dryRun) console.log(`  Mode      : ${chalk.yellow.bold("dry-run")}`);
  console.log(`  Targets   : ${chalk.cyan(targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan(bumpType)}`);
  if (commitMessage) console.log(`  Message   : ${chalk.cyan(commitMessage)}`);
  console.log(
    `  Changelog : ${
      isPreIteration
        ? chalk.dim("skipped (prerelease iteration)")
        : semanticChangelog
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
    const result = await bump({ targets, bumpType, message: commitMessage, preId, config, vcs, dryRun });

    spinner.succeed(
      dryRun ? chalk.yellow("Dry-run completed — no changes made.") : chalk.green("Bump completed successfully!"),
    );
    console.log();

    for (const item of result.bumpedProjects) {
      const prefix = dryRun ? chalk.dim("  [dry-run] ") : "  ";
      console.log(`${prefix}${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`);
    }
    if (result.tag) {
      const prefix = dryRun ? chalk.dim("  [dry-run] Tag  ") : "  Tag         ";
      console.log(`${prefix}: ${chalk.cyan(result.tag)}`);
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
