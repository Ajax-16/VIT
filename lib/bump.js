import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import semver from "semver";

const ROOT = process.cwd();

function npmVersion(dir, bumpType, preId = null) {
  const npmBumpType =
    bumpType === "prerelease"
      ? `prerelease --preid ${preId ?? "pre"}`
      : bumpType;

  execSync(`npm version ${npmBumpType} --no-git-tag-version`, {
    cwd: resolve(ROOT, dir),
    stdio: "inherit",
  });
}
function getVersion(dir) {
  const pkg = JSON.parse(
    readFileSync(resolve(ROOT, dir, "package.json"), "utf-8"),
  );
  return pkg.version;
}

export function getNextVersion(currentVersion, bumpType, preId = null) {
  if (bumpType === "prerelease") {
    // Si ya es una pre-release con el mismo id, incrementa el número
    // 1.2.0-beta.1 + prerelease(beta) → 1.2.0-beta.2
    // 1.2.0 + prerelease(beta)        → 1.2.0-beta.1
    // 1.2.0-rc.1 + prerelease(beta)   → 1.2.0-beta.1 (cambio de id)
    return semver.inc(currentVersion, "prerelease", preId ?? "pre");
  }
  // Si venimos de una pre-release y hacemos patch/minor/major → promueve a estable
  // 1.2.0-beta.3 + patch → 1.2.0
  const clean = semver.parse(currentVersion);
  if (clean.prerelease.length > 0) {
    return `${clean.major}.${clean.minor}.${clean.patch}`;
  }
  if (bumpType === "major") return `${clean.major + 1}.0.0`;
  if (bumpType === "minor") return `${clean.major}.${clean.minor + 1}.0`;
  return `${clean.major}.${clean.minor}.${clean.patch + 1}`;
}

export async function bump({
  targets,
  bumpType,
  preId = null,
  message,
  config,
  vcs,
  dryRun = false,
}) {
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
      const next = getNextVersion(current, bumpType, preId);
      console.log(
        chalk.dim("  [dry-run] ") +
          chalk.cyan(`${project.label}: ${current} → ${next}`) +
          chalk.dim(" (package.json not modified)"),
      );
      bumpedProjects.push({
        id: project.id,
        label: project.label,
        path: project.path,
        tagPrefix: project.tagPrefix,
        version: next,
      });
    } else {
      npmVersion(project.path, bumpType, preId);
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
    console.log(
      chalk.dim(`  [dry-run] commit : "${fullMessage}" (not executed)`),
    );
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
