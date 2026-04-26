/**
 * lib/cli.js — CLI argument parser for VIT
 *
 * Design principles:
 *   - Every flag maps to one COMMAND or one OPTION.
 *   - Adding a new flag = add one entry to COMMANDS or OPTIONS, nothing else.
 *   - parseArgs() always returns a normalized CliContext object (never throws).
 *   - isHeadless() returns true when enough args are present to skip all prompts.
 *
 * Usage:
 *   node index.js release --bump patch --message "chore: release" --yes
 *   node index.js commit --message "fix: typo" --yes
 *   node index.js rollback --tag v1.2.3 --yes
 *   node index.js --dry-run release --bump minor --yes
 *   node index.js --help
 *   node index.js --version
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Command registry ──────────────────────────────────────────────────────────
// To add a new command: append one object here.
// Fields:
//   value     — internal identifier (matches accion in index.js)
//   aliases   — alternative CLI names
//   describe  — shown in --help

export const COMMANDS = [
  {
    value: "release",
    aliases: ["release"],
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
];

// ── Option registry ───────────────────────────────────────────────────────────
// To add a new option: append one object here.
// Fields:
//   flag      — primary flag name (without --)
//   aliases   — alternative flag names (without --)
//   arg       — true if the flag expects a value after it
//   describe  — shown in --help
//   default   — default value when not provided (undefined = not set)

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
    flag: "yes",
    aliases: ["y"],
    arg: false,
    describe: "Skip all confirmation prompts",
    default: false,
  },
  {
    flag: "dry-run",
    aliases: ["n"],
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
  const map = new Map(); // "--flag" | "-alias" → option definition
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
 * @property {boolean}       yes        — skip confirmations
 * @property {boolean}       dryRun     — dry-run mode
 * @property {boolean}       help       — --help requested
 * @property {boolean}       version    — --version requested
 * @property {boolean}       headless   — true when command can run without prompts
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
    yes: false,
    dryRun: false,
    help: false,
    version: false,
    headless: false,
    unknown: [],
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    // ── Command token (no leading dash) ────────────────────────────────────
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

    // ── Flag token ─────────────────────────────────────────────────────────
    // Support both "--flag value" and "--flag=value"
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
      // Boolean flag
      ctx[camelCase(opt.flag)] = true;
      i++;
      continue;
    }

    // Value flag
    const value = inlineValue ?? argv[i + 1];
    if (value === undefined || value.startsWith("-")) {
      ctx.unknown.push(token); // flag with missing value
    } else {
      ctx[camelCase(opt.flag)] = value;
      if (inlineValue === null) i++; // consume next token only when not inline
    }
    i++;
  }

  // Normalise projects
  if (typeof ctx.projects === "string") {
    ctx.projects = ctx.projects.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // Determine headless mode
  ctx.headless = resolveHeadless(ctx);

  return ctx;
}

/**
 * Returns true when the CLI context carries enough information to execute
 * the requested command without interactive prompts.
 *
 * Rules per command:
 *   release  — needs: command + bump + yes
 *   commit   — needs: command + message + yes
 *   changelog— needs: command + yes  (no-op entry, just commit)
 *   rollback — needs: command + tag + yes
 */
function resolveHeadless(ctx) {
  if (!ctx.command || !ctx.yes) return false;
  switch (ctx.command) {
    case "release":   return Boolean(ctx.bump);
    case "commit":    return Boolean(ctx.message);
    case "changelog": return true;
    case "rollback":  return Boolean(ctx.tag);
    default:          return false;
  }
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
    "    vit release --bump minor --projects core,frontend --message \"chore: v2\" --yes",
    "    vit commit  --message \"fix: typo\" --yes",
    "    vit rollback --tag v1.2.3 --yes",
    "    vit release --bump patch --dry-run --yes",
    "",
  );

  console.log(lines.join("\n"));
}

export function printVersion() {
  const pkg = require("../package.json");
  console.log(`${pkg.version}`);
}
