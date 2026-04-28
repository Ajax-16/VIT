/**
 * lib/vit-vars.js — Built-in variables resolved at runtime.
 *
 * Variables are injected into every action's env with the lowest priority,
 * so any user-defined variable (captureAs, env, promptEnv) overrides them.
 *
 * Available variables:
 *
 *   Time:
 *     ${date}           — YYYY-MM-DD
 *     ${datetime}       — YYYY-MM-DD HH:MM
 *     ${timestamp}      — Unix timestamp in ms
 *     ${year}           — current year
 *     ${month}          — current month (01-12)
 *     ${day}            — current day (01-31)
 *     ${time}           — HH:MM:SS
 *
 *   Git:
 *     ${branch}         — current branch
 *     ${commit_hash}    — short HEAD hash
 *     ${last_tag}       — latest tag
 *     ${commit_count}   — commits since last tag
 *     ${tag_count}      — total number of tags
 *     ${commit_author}  — author of last commit
 *     ${commit_message} — message of last commit
 *
 *   Package:
 *     ${version}              — version at action.cwd
 *     ${name}                 — name at action.cwd
 *     ${version.<id>}         — version of a monorepo project
 *     ${name.<id>}            — name of a monorepo project
 *
 *   System:
 *     ${node_version}   — Node.js version
 *     ${os}             — linux | darwin | win32
 *     ${arch}           — x64 | arm64 | ...
 *     ${cwd}            — process.cwd()
 */

import { execSync } from "child_process";
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

function sanitizeForShell(str) {
  // Remove: | & ; ` $ ( ) < > " ' \n \r
  return str.replace(/[|&;`$()<>"'\r\n\\]/g, "");
}

function gitExec(command, cwd) {
  try {
    return sanitizeForShell(
      execSync(command, { cwd, stdio: ["pipe", "pipe", "pipe"] })
        .toString()
        .trim(),
    );
  } catch {
    return "";
  }
}

function gitExecRaw(command, cwd) {
  try {
    return execSync(command, { cwd, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/**
 * @param {string}   actionCwd      - cwd of the action being executed
 * @param {object[]} configProjects - config.projects array (may be empty)
 */
export function resolveVitBuiltins(
  actionCwd = process.cwd(),
  configProjects = [],
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

  // ── Git ───────────────────────────────────────────────────────────────────
  builtins["branch"] = gitExec("git rev-parse --abbrev-ref HEAD", cwd);
  builtins["commit_hash"] = gitExec("git rev-parse --short HEAD", cwd);
  builtins["commit_author"] = gitExec("git log -1 --format=%an", cwd);
  builtins["last_commit_message"] = gitExec("git log -1 --format=%s", cwd);
  builtins["tag_count"] =
    gitExec("git tag | wc -l", cwd).replace(/\s/g, "") || "0";

  const lastTag = gitExec("git describe --tags --abbrev=0", cwd);
  builtins["last_tag"] = lastTag;

  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  builtins["commit_count"] =
    gitExec(`git rev-list ${range} --count`, cwd) || "0";

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
