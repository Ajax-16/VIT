import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import chalk from "chalk";
import semver from "semver";

const ROOT = process.cwd();

// Maps our internal preType to the npm version identifier
const PRE_BUMP_MAP = {
  prepatch: "prepatch",
  preminor: "preminor",
  premajor: "premajor",
  prerelease: "prerelease",
};

function npmVersion(dir, bumpType, preId = null) {
  const isPreType = bumpType in PRE_BUMP_MAP;
  const npmBumpType = isPreType
    ? `${bumpType} --preid ${preId ?? "pre"}`
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

/**
 * Calculate what the next version string will be without touching disk.
 *
 * bumpType can be:
 *   patch | minor | major          — stable bump
 *   prepatch | preminor | premajor  — start a new prerelease cycle
 *   prerelease                      — iterate within an existing prerelease
 *   promote                         — strip prerelease suffix (1.1.0-alpha.3 → 1.1.0)
 */
export function getNextVersion(currentVersion, bumpType, preId = null) {
  if (bumpType === "promote") {
    const clean = semver.parse(currentVersion);
    if (!clean) throw new Error(`Cannot parse version: ${currentVersion}`);
    return `${clean.major}.${clean.minor}.${clean.patch}`;
  }

  if (bumpType in PRE_BUMP_MAP) {
    return semver.inc(currentVersion, bumpType, preId ?? "pre");
  }

  // stable bump: if current version already has a prerelease suffix just strip it
  const clean = semver.parse(currentVersion);
  if (!clean) throw new Error(`Cannot parse version: ${currentVersion}`);
  if (clean.prerelease.length > 0) {
    // e.g. 1.1.0-alpha.3 → 1.1.0  (minor bump is already encoded)
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

  // "promote" needs special handling: npm version does not know this type,
  // so we pass the resolved stable version explicitly via --no-git-tag-version
  const isPromote = bumpType === "promote";

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
      if (isPromote) {
        const current = getVersion(project.path);
        const stableVersion = getNextVersion(current, "promote");
        execSync(
          `npm version ${stableVersion} --no-git-tag-version --allow-same-version`,
          { cwd: resolve(ROOT, project.path), stdio: "inherit" },
        );
      } else {
        npmVersion(project.path, bumpType, preId);
      }
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
