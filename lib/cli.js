/**
 * lib/cli.js — CLI argument parser for VIT
 *
 * Design principles:
 *   - Every flag maps to one COMMAND or one OPTION.
 *   - Adding a new flag = add one entry to COMMANDS or OPTIONS, nothing else.
 *   - parseArgs() always returns a normalized CliContext object (never throws).
 *
 * Usage:
 *   node index.js release --bump patch --message "chore: release" --yes
 *   node index.js commit --message "fix: typo" --yes
 *   node index.js rollback --tag v1.2.3 --yes
 *   node index.js promote --yes
 *   node index.js sync
 *   node index.js --dry-run release --bump minor --yes
 *   node index.js --help
 *   node index.js --version
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Command registry ──────────────────────────────────────────────────────────
export const COMMANDS = [
  {
    value: "init",
    aliases: ["init", "i"],
    describe:
      "Initialize vit-config.json and VS Code IntelliSense in the current directory",
  },
  {
    value: "release",
    aliases: ["release", "r"],
    describe: "Bump version + update changelog + commit + push",
  },
  {
    value: "commit",
    aliases: ["commit", "c"],
    describe: "Commit and push without version bump",
  },
  {
    value: "changelog",
    aliases: ["changelog", "cl"],
    describe: "Add or edit changelog entries only",
  },
  {
    value: "rollback",
    aliases: ["rollback", "rb"],
    describe: "Roll back to a specific tag",
  },
  {
    value: "promote",
    aliases: ["promote", "pr"],
    describe: "Promote prerelease branch: merge into main + create stable release",
    prereqBranch: "prerelease",
  },
  {
    value: "sync",
    aliases: ["sync", "sy"],
    describe: "Sync prerelease branches that are behind their release branch",
  },
];

// ── Option registry ───────────────────────────────────────────────────────────
export const OPTIONS = [
  {
    flag: "bump",
    aliases: ["b"],
    arg: true,
    describe: "Bump type: patch | minor | major  (required for release)",
    default: undefined,
  },
  {
    flag: "projects",
    aliases: ["p"],
    arg: true,
    describe: "Comma-separated project IDs to bump  (default: all)",
    default: undefined,
  },
  {
    flag: "message",
    aliases: ["m"],
    arg: true,
    describe: "Commit message  (uses config default if omitted)",
    default: undefined,
  },
  {
    flag: "tag",
    aliases: ["t"],
    arg: true,
    describe: "Tag to roll back to  (required for rollback)",
    default: undefined,
  },
  {
    flag: "target",
    aliases: [],
    arg: true,
    describe: "Target release branch for promote  (default: first releaseBranch in config)",
    default: undefined,
  },
  {
    flag: "semantic",
    aliases: ["s"],
    arg: false,
    describe: "Force semantic changelog regeneration",
    default: false,
  },
  {
    flag: "yes",
    aliases: ["y"],
    arg: false,
    describe: "Skip all prompts and confirmations, use defaults or provided flags",
    default: false,
  },
  {
    flag: "dry-run",
    aliases: ["d"],
    arg: false,
    describe: "Preview actions without writing anything",
    default: false,
  },
  {
    flag: "help",
    aliases: ["h"],
    arg: false,
    describe: "Show this help message and exit",
    default: false,
  },
  {
    flag: "version",
    aliases: ["v"],
    arg: false,
    describe: "Print VIT version and exit",
    default: false,
  },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildFlagMap() {
  const map = new Map();
  for (const opt of OPTIONS) {
    map.set(`--${opt.flag}`, opt);
    for (const alias of opt.aliases) {
      map.set(alias.length === 1 ? `-${alias}` : `--${alias}`, opt);
    }
  }
  return map;
}

function buildCommandMap() {
  const map = new Map();
  for (const cmd of COMMANDS) {
    for (const alias of cmd.aliases) {
      map.set(alias, cmd.value);
    }
  }
  return map;
}

const FLAG_MAP = buildFlagMap();
const CMD_MAP = buildCommandMap();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CliContext
 * @property {string|null}   command    — detected command value or null
 * @property {string|null}   bump       — patch | minor | major
 * @property {string[]|null} projects   — project IDs or null (= all)
 * @property {string|null}   message    — commit message override
 * @property {string|null}   tag        — tag for rollback
 * @property {string|null}   target     — target branch for promote
 * @property {boolean}       yes        — skip all prompts and confirmations
 * @property {boolean}       semantic   — force semantic changelog mode
 * @property {boolean}       dryRun     — dry-run mode
 * @property {boolean}       help       — --help requested
 * @property {boolean}       version    — --version requested
 * @property {string[]}      unknown    — unrecognised tokens
 */

/**
 * Parse process.argv and return a normalised CliContext.
 * Never throws — unrecognised tokens land in `unknown`.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  /** @type {CliContext} */
  const ctx = {
    command: null,
    bump: null,
    projects: null,
    message: null,
    tag: null,
    target: null,
    semantic: false,
    yes: false,
    dryRun: false,
    help: false,
    version: false,
    unknown: [],
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    if (!token.startsWith("-")) {
      const resolved = CMD_MAP.get(token);
      if (resolved) {
        ctx.command = resolved;
      } else {
        ctx.unknown.push(token);
      }
      i++;
      continue;
    }

    let rawFlag = token;
    let inlineValue = null;
    const eqIdx = token.indexOf("=");
    if (eqIdx !== -1) {
      rawFlag = token.slice(0, eqIdx);
      inlineValue = token.slice(eqIdx + 1);
    }

    const opt = FLAG_MAP.get(rawFlag);

    if (!opt) {
      ctx.unknown.push(token);
      i++;
      continue;
    }

    if (!opt.arg) {
      ctx[camelCase(opt.flag)] = true;
      i++;
      continue;
    }

    const value = inlineValue ?? argv[i + 1];
    if (value === undefined || value.startsWith("-")) {
      ctx.unknown.push(token);
    } else {
      ctx[camelCase(opt.flag)] = value;
      if (inlineValue === null) i++;
    }
    i++;
  }

  if (typeof ctx.projects === "string") {
    ctx.projects = ctx.projects
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return ctx;
}

/** Convert kebab-case flag name to camelCase property key. */
function camelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// ── Help / version output ─────────────────────────────────────────────────────

export function printHelp() {
  const pkg = require("../package.json");
  const lines = [
    "",
    `  VIT v${pkg.version} — Version It!`,
    "",
    "  Usage:",
    "    vit [command] [options]",
    "",
    "  Commands:",
  ];

  const cmdWidth = Math.max(...COMMANDS.map((c) => c.aliases[0].length)) + 2;
  for (const cmd of COMMANDS) {
    lines.push(`    ${cmd.aliases[0].padEnd(cmdWidth)}  ${cmd.describe}`);
  }

  lines.push("", "  Options:");

  const flagWidth = Math.max(...OPTIONS.map((o) => o.flag.length)) + 4;
  for (const opt of OPTIONS) {
    const flag = `--${opt.flag}${opt.arg ? " <value>" : ""}`;
    lines.push(`    ${flag.padEnd(flagWidth)}  ${opt.describe}`);
  }

  lines.push(
    "",
    "  Examples:",
    "    vit release --bump patch --yes",
    '    vit release --bump minor --projects core,frontend --message "chore: v2" --yes',
    '    vit commit  --message "fix: typo" --yes',
    "    vit rollback --tag v1.2.3 --yes",
    "    vit release --bump patch --dry-run --yes",
    "    vit promote --yes",
    "    vit promote --target main --yes",
    "    vit sync",
    "    vit sync --dry-run",
    "",
  );

  console.log(lines.join("\n"));
}

export function printVersion() {
  const pkg = require("../package.json");
  console.log(`${pkg.version}`);
}
