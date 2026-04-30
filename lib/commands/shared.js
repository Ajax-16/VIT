import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { getNextVersion } from "../bump.js";
import { runChangelog, editChangelog } from "../changelog.js";

// ── Error helpers ──────────────────────────────────────────────────────────────────

export function writeErrorLog(err) {
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

export function printError(err) {
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
    "\n",
  );
}

// ── Pre-release branch resolution ─────────────────────────────────────────────────

export function resolvePreReleaseBranch(branch, config) {
  const preReleaseBranches = config.git?.preReleaseBranches ?? [];
  const matched = branch
    ? preReleaseBranches.find((pattern) => {
        const name = typeof pattern === "string" ? pattern : pattern?.name;
        if (!name) return false;
        const escaped = name
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*");
        return new RegExp(`^${escaped}$`).test(branch);
      }) ?? null
    : null;

  const isOnPreReleaseBranch = matched !== null;
  const preId = isOnPreReleaseBranch
    ? typeof matched === "string"
      ? matched
      : String(matched?.id ?? matched?.name ?? "pre")
    : null;

  return { isOnPreReleaseBranch, preId, matched };
}

// ── Changelog step ───────────────────────────────────────────────────────────────────

export async function runChangelogStep({ cli, config, dryRun, accion, bumpResult, semanticChangelog }) {
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

  if (accion === "promote" && cli.yes && !cli.semantic) return false;

  let pendingTag;
  if ((accion === "release" || accion === "promote") && bumpResult) {
    try {
      const selectedProjects = config.projects.filter((p) =>
        bumpResult.targets.includes(p.id),
      );
      const pendingVersions = selectedProjects.map((p) => {
        const pkg = JSON.parse(readFileSync(resolve(p.path, "package.json"), "utf-8"));
        const nextVer = getNextVersion(pkg.version, bumpResult.bumpType, bumpResult.preId);
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
      const { action } = await inquirer.prompt([{
        type: "list", name: "action",
        message: "What to do with the changelog?",
        choices: [
          { name: "Nothing", value: "none" },
          { name: "Add new entry", value: "add" },
          { name: "Edit existing version", value: "edit" },
        ],
        default: "none",
      }]);
      if (action === "none") { skipChangelog = true; break; }
      if (action === "edit") { await editChangelog(config); return true; }
      break;
    }
  }

  if (skipChangelog) return false;
  if (cli.yes && !cli.semantic) return false;

  const result = await runChangelog(config, {
    yes: cli.yes,
    pendingTag,
    semanticChangelog: cli.semantic,
  });
  return result?.saved === true;
}

// ── Commit message resolution ──────────────────────────────────────────────────────────

export async function resolveCommitMessage({ cli, config, vcs, accion }) {
  const defaultMsg =
    accion === "release" || accion === "promote"
      ? config.git.releaseCommitMessage
      : accion === "changelog"
      ? config.git.changelogCommitMessage
      : config.git.defaultCommitMessage;

  if (cli.yes) return cli.message ?? defaultMsg;

  if (cli.message) {
    console.log(chalk.dim(`  Message pre-selected: ${chalk.cyan(cli.message)}\n`));
    return cli.message;
  }

  const { message } = await inquirer.prompt([{
    type: "input", name: "message",
    message: vcs.supportsCommit() ? "Commit message:" : "Descriptive message for the operation:",
    default: defaultMsg,
    validate: (v) => v.trim().length > 0 || "The message cannot be empty",
  }]);
  return message;
}

// ── Project targets resolution ───────────────────────────────────────────────────────────

export async function resolveTargets({ cli, config }) {
  const configuredProjects = config.projects ?? [];
  if (configuredProjects.length === 0) {
    console.log(chalk.red("\n  ✖ No projects configured in vit-config.json.\n"));
    process.exit(1);
  }

  if (cli.yes) {
    const ids = cli.projects ?? configuredProjects.map((p) => p.id);
    const invalid = ids.filter((id) => !configuredProjects.find((p) => p.id === id));
    if (invalid.length > 0) {
      console.log(chalk.red(`\n  ✖ Unknown project(s): ${invalid.join(", ")}\n`));
      process.exit(1);
    }
    console.log(chalk.green(`\n  ✔ Projects : ${ids.join(", ")}\n`));
    return ids;
  }

  if (configuredProjects.length === 1) {
    console.log(
      chalk.green(`\n  ✔ Project selected automatically: ${configuredProjects[0].label} (${configuredProjects[0].id})\n`),
    );
    return [configuredProjects[0].id];
  }

  const projectChoices = [
    { name: "all — All configured projects", value: "__all__" },
    ...configuredProjects.map((p) => ({
      name: `${p.id} — ${p.label} (${p.path})`,
      value: p.id,
    })),
  ];
  const { targets } = await inquirer.prompt([{
    type: "checkbox", name: "targets",
    message: "Which projects to bump?",
    choices: projectChoices,
    validate: (v) => v.length > 0 || "Select at least one",
  }]);
  return targets.includes("__all__") ? configuredProjects.map((p) => p.id) : targets;
}
