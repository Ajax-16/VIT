import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";

const ROOT = process.cwd();

function npmVersion(dir, bumpType) {
  execSync(`npm version ${bumpType} --no-git-tag-version`, {
    cwd: resolve(ROOT, dir),
    stdio: "inherit",
    encoding: "utf-8",
  });
}

function getVersion(dir) {
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, dir, "package.json"), "utf-8"),
  );
  return pkg.version;
}

export function getNextVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split(".").map(Number);
  if (bumpType === "major") return `${major + 1}.0.0`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export async function bump({ targets, bumpType, message, config, vcs, dryRun = false }) {
  const selectedProjects = config.projects.filter((project) =>
    targets.includes(project.id),
  );

  if (selectedProjects.length === 0) {
    throw new Error("No valid projects selected for bumping.");
  }

  const bumpedProjects = [];

  for (const project of selectedProjects) {
    if (dryRun) {
      const current = getVersion(project.path);
      const next = getNextVersion(current, bumpType);
      console.log(
        chalk.dim("  [dry-run] ") +
        chalk.cyan(`${project.label}: ${current} → ${next}`) +
        chalk.dim(" (package.json not modified)")
      );
      bumpedProjects.push({
        id: project.id,
        label: project.label,
        path: project.path,
        tagPrefix: project.tagPrefix,
        version: next,
      });
    } else {
      npmVersion(project.path, bumpType);
      const version = getVersion(project.path);
      bumpedProjects.push({
        id: project.id,
        label: project.label,
        path: project.path,
        tagPrefix: project.tagPrefix,
        version,
      });
    }
  }

  let fullMessage = message;
  for (const project of bumpedProjects) {
    fullMessage += ` | ${project.tagPrefix}-${project.version}`;
  }

  const tag = bumpedProjects
    .map((project) => `${project.tagPrefix}-${project.version}`)
    .join("-");

  if (dryRun) {
    console.log(chalk.dim(`  [dry-run] commit : "${fullMessage}" (not executed)`));
    console.log(chalk.dim(`  [dry-run] tag    : "${tag}" (not created)`));
    console.log(chalk.dim(`  [dry-run] push   : skipped`));
    return { bumpedProjects, tag };
  }

  if (vcs.supportsVersioning()) {
    vcs.addAll();
    vcs.commit(fullMessage);
    vcs.tag(tag, fullMessage);
    vcs.pushWithTags();
    return { bumpedProjects, tag };
  }

  return { bumpedProjects, tag: null };
}
