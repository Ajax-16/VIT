/**
 * lib/vit-vars.js — Built-in variables resolved at runtime.
 *
 *   Time:
 *     ${date}                — YYYY-MM-DD
 *     ${datetime}            — YYYY-MM-DD HH:MM
 *     ${timestamp}           — Unix timestamp in ms
 *     ${year}                — current year
 *     ${month}               — current month (01-12)
 *     ${day}                 — current day (01-31)
 *     ${time}                — HH:MM:SS
 *
 *   Git:
 *     ${branch}              — current branch
 *     ${commit_hash}         — short HEAD hash
 *     ${last_tag}            — latest tag
 *     ${commit_count}        — commits since last tag
 *     ${tag_count}           — total number of tags
 *     ${commit_author}       — author of last commit
 *     ${last_commit_message} — message of last commit
 *
 *   Package:
 *     ${version}             — version at action.cwd
 *     ${name}                — name at action.cwd
 *     ${version.<id>}        — version of a monorepo project
 *     ${name.<id>}           — name of a monorepo project
 *
 *   System:
 *     ${node_version}        — Node.js version
 *     ${os}                  — linux | darwin | win32
 *     ${arch}                — x64 | arm64 | ...
 *     ${cwd}                 — process.cwd()
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function readPackageField(dir, field) {
  try {
    const pkgPath = resolve(dir, "package.json");
    if (!existsSync(pkgPath)) return "";
    return JSON.parse(readFileSync(pkgPath, "utf-8"))[field] ?? "";
  } catch {
    return "";
  }
}

/**
 * @param {string}   actionCwd      - cwd of the action being executed
 * @param {object[]} configProjects - config.projects array (may be empty)
 * @param {object}   vcs            - vcsAdapter instance
 */
export function resolveVitBuiltins(
  actionCwd = process.cwd(),
  configProjects = [],
  vcs = null,
) {
  const cwd = resolve(actionCwd);
  const builtins = {};

  // ── Time ──────────────────────────────────────────────────────────────────
  const now = new Date();
  builtins["date"] = now.toISOString().slice(0, 10);
  builtins["datetime"] = now.toISOString().slice(0, 16).replace("T", " ");
  builtins["timestamp"] = String(now.getTime());
  builtins["year"] = String(now.getFullYear());
  builtins["month"] = String(now.getMonth() + 1).padStart(2, "0");
  builtins["day"] = String(now.getDate()).padStart(2, "0");
  builtins["time"] = now.toTimeString().slice(0, 8);

  // ── Git (via vcsAdapter) ──────────────────────────────────────────────────
  builtins["branch"] = vcs?.getCurrentBranch() ?? "";
  builtins["commit_hash"] = vcs?.getCommitHash() ?? "";
  builtins["commit_author"] = vcs?.getCommitAuthor() ?? "";
  builtins["last_commit_message"] = vcs?.getLastCommitMessage() ?? "";
  builtins["last_tag"] = vcs?.getLastTag() ?? "";
  builtins["tag_count"] = vcs?.getTagCount() ?? "0";

  const lastTag = builtins["last_tag"];
  builtins["commit_count"] = vcs?.getCommitCount(lastTag) ?? "0";

  // ── Package (action cwd) ──────────────────────────────────────────────────
  builtins["version"] = readPackageField(cwd, "version");
  builtins["name"] = readPackageField(cwd, "name");

  // ── Package per project (monorepo) ────────────────────────────────────────
  for (const project of configProjects) {
    if (!project?.id || !project?.path) continue;
    const projectDir = resolve(process.cwd(), project.path);
    builtins[`version.${project.id}`] = readPackageField(projectDir, "version");
    builtins[`name.${project.id}`] = readPackageField(projectDir, "name");
  }

  // ── System ────────────────────────────────────────────────────────────────
  builtins["node_version"] = process.version.replace("v", "");
  builtins["os"] = process.platform;
  builtins["arch"] = process.arch;
  builtins["cwd"] = process.cwd();

  return builtins;
}
