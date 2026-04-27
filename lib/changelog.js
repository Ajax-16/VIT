import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";

// ── Helpers derived from config ──────────────────────────────────────────────

function getTypeLabels(config) {
  return Object.fromEntries(config.types.map((t) => [t.value, t.label]));
}

function getTypeOrder(config) {
  return config.types.map((t) => t.value);
}

function getTypeChoices(config) {
  return config.types.map((t) => ({
    name: t.choiceLabel ?? t.label,
    value: t.value,
  }));
}

// ── Utils ────────────────────────────────────────────────────────────────────

function formatDate(isoDate) {
  const date = isoDate ? new Date(isoDate) : new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function today() {
  return formatDate(null);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitExec(cmd, cwd = process.cwd()) {
  return execSync(cmd, { cwd, encoding: "utf-8" }).trim();
}

// ── Git helpers ──────────────────────────────────────────────────────────────

function getAllTagsSorted(cwd = process.cwd()) {
  try {
    const raw = gitExec("git tag --sort=-creatordate", cwd);
    return raw ? raw.split("\n").map((t) => t.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getTagDate(tag, cwd = process.cwd()) {
  try {
    return gitExec(`git log -1 --format=%ai "${tag}"`, cwd).split(" ")[0];
  } catch {
    return null;
  }
}

function getCommitsBetween(from, to, cwd = process.cwd()) {
  const range = from ? `${from}..${to}` : to;
  try {
    const raw = gitExec(`git log ${range} --pretty=format:"%s"`, cwd);
    return raw
      ? raw.split("\n").map((l) => l.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function getCommitsToHead(from, cwd = process.cwd()) {
  const range = from ? `${from}..HEAD` : "HEAD";
  try {
    const raw = gitExec(`git log ${range} --pretty=format:"%s"`, cwd);
    return raw
      ? raw.split("\n").map((l) => l.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

// ── Conventional commit parser ───────────────────────────────────────────────

const CONVENTIONAL_RE =
  /^(?<type>[a-z]+)(\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/;

function parseCommit(line) {
  const match = CONVENTIONAL_RE.exec(line);
  if (!match) return null;
  const { type, scope, breaking, description } = match.groups;
  return {
    type,
    scope: scope ?? null,
    description,
    breaking: breaking === "!",
    raw: line,
  };
}

/**
 * Returns an array of tag entries in reverse-chronological order,
 * each with its commits (parsed conventional commits only).
 *
 * When `pendingTag` is provided a virtual entry is prepended for the commits
 * between the most-recent tag and HEAD.
 *
 * Shape: Array<{ tag, date, commits, pending? }>
 */
export function parseAllTagsWithCommits(config, cwd = process.cwd(), opts = {}) {
  const { pendingTag } = opts;
  const knownTypes = new Set(config.types.map((t) => t.value));
  const tags = getAllTagsSorted(cwd);

  const result = [];

  if (pendingTag) {
    const mostRecentTag = tags[0] ?? null;
    const rawLines = getCommitsToHead(mostRecentTag, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));
    result.push({ tag: pendingTag, date: null, commits, pending: true });
  }

  if (tags.length === 0) return result;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const prevTag = tags[i + 1] ?? null;
    const date = getTagDate(tag, cwd);
    const rawLines = getCommitsBetween(prevTag, tag, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));
    result.push({ tag, date, commits });
  }

  return result;
}

/**
 * Returns only the commits between the last tag and HEAD, parsed and
 * filtered by known types. Used by the interactive semantic flow.
 */
export function parseCommitsSinceLastTag(config, cwd = process.cwd()) {
  const knownTypes = new Set(config.types.map((t) => t.value));
  const tags = getAllTagsSorted(cwd);
  const lastTag = tags[0] ?? null;
  const rawLines = getCommitsToHead(lastTag, cwd);
  return rawLines
    .map(parseCommit)
    .filter((c) => c !== null && knownTypes.has(c.type));
}

// ── Build helpers ────────────────────────────────────────────────────────────

function buildSection(version, entries, config, intro = null, date = null) {
  const TYPE_LABELS = getTypeLabels(config);
  const TYPE_ORDER = getTypeOrder(config);

  const groups = {};
  for (const entry of entries) {
    if (!groups[entry.type]) groups[entry.type] = [];
    groups[entry.type].push(entry);
  }

  let md = `## [${version}] - ${date ? formatDate(date) : today()}\n\n`;
  if (intro) md += `> ${intro}\n\n`;

  const sorted = Object.entries(groups).sort(
    ([a], [b]) =>
      (TYPE_ORDER.indexOf(a) !== -1 ? TYPE_ORDER.indexOf(a) : 99) -
      (TYPE_ORDER.indexOf(b) !== -1 ? TYPE_ORDER.indexOf(b) : 99),
  );

  for (const [type, items] of sorted) {
    md += `### ${TYPE_LABELS[type] ?? type}\n\n`;
    for (const item of items) {
      const scope = item.scope ? `*(${item.scope})* ` : "";
      const breaking = item.breaking ? `**❗** ` : "";
      md += `- ${scope}${breaking}${item.description}\n\n`;
    }
    md += "\n";
  }

  return md;
}

function prependToChangelog(content, filePath, title) {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    const header = `# ${title}\n\n`;
    if (existing.startsWith(header)) {
      const rest = existing.replace(header, "");
      writeFileSync(filePath, `${header}${content}\n${rest}`);
    } else {
      writeFileSync(filePath, `${header}${content}\n${existing}`);
    }
  } else {
    writeFileSync(filePath, `# ${title}\n\n${content}`);
  }
}

function buildFullChangelogContent(tagEntries, config) {
  const title = config.changelog.title ?? "Changelog";
  let content = `# ${title}\n\n`;
  for (const { tag, date, commits } of tagEntries) {
    if (commits.length > 0) {
      content += buildSection(tag, commits, config, null, date);
    }
  }
  return content;
}

function parseSections(filePath) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const sections = [];
  const sectionRegex = /^## .+$/gm;
  let match;
  const matches = [];
  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push(match.index);
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = matches[i + 1] ?? content.length;
    const raw = content.slice(start, end);
    const header = raw.split("\n")[0];
    sections.push({ header, raw, start, end });
  }
  return sections;
}

function injectEntriesToSection(sectionRaw, newEntries, config, intro = null) {
  const TYPE_LABELS = getTypeLabels(config);
  const TYPE_ORDER = getTypeOrder(config);

  if (intro) {
    const h2Line = sectionRaw.split("\n")[0];
    if (!sectionRaw.includes(`> ${intro}`)) {
      sectionRaw = sectionRaw.replace(h2Line, `${h2Line}\n\n> ${intro}`);
    }
  }

  const groups = {};
  for (const entry of newEntries) {
    if (!groups[entry.type]) groups[entry.type] = [];
    groups[entry.type].push(entry);
  }

  const sorted = Object.entries(groups).sort(
    ([a], [b]) =>
      (TYPE_ORDER.indexOf(a) !== -1 ? TYPE_ORDER.indexOf(a) : 99) -
      (TYPE_ORDER.indexOf(b) !== -1 ? TYPE_ORDER.indexOf(b) : 99),
  );

  let addition = "";

  for (const [type, items] of sorted) {
    const label = TYPE_LABELS[type] ?? type;
    const typeHeader = `### ${label}`;
    const newLines = items
      .map((item) => {
        const scope = item.scope ? `*(${item.scope})* ` : "";
        const breaking = item.breaking ? `**❗** ` : "";
        return `- ${scope}${breaking}${item.description}`;
      })
      .join("\n\n");

    if (sectionRaw.includes(typeHeader)) {
      const blockRegex = new RegExp(
        `(### ${escapeRegex(label)}\\n[\\s\\S]*?)(?=\\n### |\\n## |$)`,
      );
      sectionRaw = sectionRaw.replace(
        blockRegex,
        (m) => m.trimEnd() + "\n\n" + newLines,
      );
    } else {
      addition += `${typeHeader}\n\n${newLines}\n\n`;
    }
  }

  if (addition) {
    const h3Regex = /### .+\n+([\s\S]+?)(?=\n### |\n## |$)/g;
    const existingGroups = {};
    let m;
    while ((m = h3Regex.exec(sectionRaw)) !== null) {
      const headerLine = m[0].split("\n")[0].replace("### ", "");
      const type =
        Object.entries(TYPE_LABELS).find(([, v]) => v === headerLine)?.[0] ?? headerLine;
      existingGroups[type] = m[0].trimEnd();
    }

    for (const [type, block] of Object.entries(
      Object.fromEntries(
        addition
          .split(/(?=### )/)
          .filter(Boolean)
          .map((b) => {
            const headerLine = b.split("\n")[0].replace("### ", "").trim();
            const type =
              Object.entries(TYPE_LABELS).find(([, v]) => v === headerLine)?.[0] ?? headerLine;
            return [type, b.trimEnd()];
          }),
      ),
    )) {
      existingGroups[type] = block;
    }

    const h2Line = sectionRaw.split("\n")[0];
    const introMatch = sectionRaw.match(/^## .+\n\n(> .+)\n/);
    const introLine = introMatch ? `${introMatch[1]}\n\n` : "";
    const reordered = TYPE_ORDER.filter((t) => existingGroups[t])
      .map((t) => existingGroups[t])
      .join("\n\n");
    sectionRaw = `${h2Line}\n\n${introLine}${reordered}\n\n`;
  }

  return sectionRaw;
}

function replaceSectionInFile(filePath, section, newRaw) {
  const content = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const updated = content.slice(0, section.start) + newRaw + content.slice(section.end);
  writeFileSync(filePath, updated);
}

// ── Prompts ──────────────────────────────────────────────────────────────────

function buildEntryPrompts(config) {
  return [
    {
      type: "list",
      name: "type",
      message: "Change type:",
      choices: getTypeChoices(config),
    },
    {
      type: "input",
      name: "scope",
      message: "Scope (optional — press Enter to skip):",
    },
    {
      type: "input",
      name: "description",
      message: "Change description:",
      validate: (v) => v.trim().length > 0 || "Description cannot be empty",
    },
    {
      type: "confirm",
      name: "breaking",
      message: "Is this a breaking change?",
      default: false,
    },
  ];
}

async function collectEntries(config) {
  const entries = [];
  let addingEntries = true;

  const { intro } = await inquirer.prompt([
    {
      type: "input",
      name: "intro",
      message: "Introductory text before the new entries (press Enter to skip):",
    },
  ]);

  const ENTRY_PROMPTS = buildEntryPrompts(config);

  while (addingEntries) {
    const entry = await inquirer.prompt(ENTRY_PROMPTS);
    entries.push({
      type: entry.type,
      scope: entry.scope.trim() || null,
      description: entry.description.trim(),
      breaking: entry.breaking,
    });
    console.log(chalk.green("  ✔ Entry added"));
    const { more } = await inquirer.prompt([
      {
        type: "confirm",
        name: "more",
        message: "Add another entry?",
        default: true,
      },
    ]);
    addingEntries = more;
  }

  return { entries, intro: intro.trim() || null };
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * MODE 1 — Manual changelog WITHOUT headless.
 * Legacy interactive flow: user types every entry manually.
 * Called from: `vit changelog` (no --yes) when semantic: false.
 */
export async function buildChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  📋 MANUAL CHANGELOG") + "\n");

  const CHANGELOG_PATH = resolve(config.changelog.path);

  const { version } = await inquirer.prompt([
    {
      type: "input",
      name: "version",
      message: "Title / version for this entry (e.g. 1.2.0):",
      validate: (v) => v.trim().length > 0 || "Please enter a title",
    },
  ]);

  const { entries, intro } = await collectEntries(config);
  const section = buildSection(version, entries, config, intro);

  console.log("\n" + chalk.yellow.bold("  Changelog preview:"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(section);
  console.log(chalk.dim("─".repeat(50)));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Save this changelog?",
      default: true,
    },
  ]);

  if (confirm) {
    prependToChangelog(section, CHANGELOG_PATH, config.changelog.title);
    console.log(chalk.green(`\n  ✔ Saved to: ${CHANGELOG_PATH}\n`));
  } else {
    console.log(chalk.yellow("\n  ⚠ Changelog discarded, continuing without it...\n"));
  }
}

/**
 * MODE 2 — Manual changelog WITH headless.
 * No-op: in headless + non-semantic mode the changelog is not touched.
 * Called from: `vit release --yes` when semantic: false.
 */
export function buildChangelogHeadless() {
  // Intentionally empty — headless non-semantic releases do not update the
  // changelog automatically. The developer is expected to have run
  // `vit changelog` manually before releasing.
  console.log(chalk.dim("  ℹ Changelog skipped (non-semantic headless mode).\n"));
}

/**
 * MODE 3 — Semantic changelog WITHOUT headless (interactive release flow).
 *
 * Called ONLY during `vit release` (never from standalone `vit changelog`)
 * when semantic: true and headless: false.
 *
 * Steps:
 *   1. Detect conventional commits between last tag and HEAD.
 *   2. Show checkbox list — user deselects commits to exclude.
 *   3. Ask for optional intro text.
 *   4. Regenerate full changelog (all past tags + new pending section).
 *   5. Preview first 80 lines and ask for confirmation.
 *   6. Write file.
 *
 * @param {object} config
 * @param {string} pendingTag — the tag that is about to be created
 * @returns {Promise<{ saved: boolean, path: string | null }>}
 */
export async function buildSemanticChangelogInteractive(config, pendingTag) {
  console.log(
    "\n" +
    chalk.cyan.bold("  🤖 SEMANTIC CHANGELOG") +
    chalk.dim(` — selecting commits for ${pendingTag}`) +
    "\n",
  );

  const CHANGELOG_PATH = resolve(config.changelog.path);

  // ── Step 1: get commits since last tag ──────────────────────────────────
  const candidates = parseCommitsSinceLastTag(config);

  if (candidates.length === 0) {
    console.log(chalk.yellow("  ⚠ No conventional commits found since last tag. Skipping changelog.\n"));
    return { saved: false, path: null };
  }

  // ── Step 2: let user deselect commits ───────────────────────────────────
  const TYPE_LABELS = getTypeLabels(config);

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: `Select commits to include in ${pendingTag}:`,
      choices: candidates.map((c, i) => ({
        name: `${TYPE_LABELS[c.type] ?? c.type}${c.scope ? ` (${c.scope})` : ""}: ${c.description}${c.breaking ? " ❗" : ""}`,
        value: i,
        checked: true,
      })),
      validate: (v) => v.length > 0 || "Select at least one commit",
    },
  ]);

  const chosenCommits = selected.map((i) => candidates[i]);

  // ── Step 3: optional intro ───────────────────────────────────────────────
  const { intro } = await inquirer.prompt([
    {
      type: "input",
      name: "intro",
      message: "Introductory text for this release (press Enter to skip):",
    },
  ]);

  // ── Step 4: build full changelog with the pending section ────────────────
  const tagEntries = parseAllTagsWithCommits(config, process.cwd(), { pendingTag });

  // Override the pending entry's commits with the user's selection
  if (tagEntries.length > 0 && tagEntries[0].pending) {
    tagEntries[0].commits = chosenCommits;
    if (intro?.trim()) tagEntries[0].intro = intro.trim();
  }

  let fullContent = `# ${config.changelog.title ?? "Changelog"}\n\n`;
  for (const { tag, date, commits, intro: entryIntro } of tagEntries) {
    if (commits.length > 0) {
      fullContent += buildSection(tag, commits, config, entryIntro ?? null, date);
    }
  }

  // ── Step 5: preview & confirm ────────────────────────────────────────────
  console.log("\n" + chalk.yellow.bold("  Changelog preview (first 80 lines):"));
  console.log(chalk.dim("─".repeat(50)));
  const lines = fullContent.split("\n");
  console.log(lines.slice(0, 80).join("\n"));
  if (lines.length > 80) console.log(chalk.dim("  … (truncated)"));
  console.log(chalk.dim("─".repeat(50)));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Overwrite ${CHANGELOG_PATH} with the regenerated changelog?`,
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("\n  ⚠ Changelog regeneration cancelled.\n"));
    return { saved: false, path: null };
  }

  // ── Step 6: write ────────────────────────────────────────────────────────
  writeFileSync(CHANGELOG_PATH, fullContent, "utf-8");
  console.log(chalk.green(`\n  ✔ Changelog regenerated at: ${CHANGELOG_PATH}\n`));
  return { saved: true, path: CHANGELOG_PATH };
}

/**
 * MODE 4 — Semantic changelog WITH headless.
 *
 * Regenerates the full changelog from ALL tags with ALL their commits.
 * No prompts. Used in CI / automated release pipelines.
 * Called from: `vit release --yes` when semantic: true.
 *
 * @param {object} config
 * @param {{ pendingTag?: string }} [opts]
 * @returns {Promise<{ saved: boolean, path: string | null }>}
 */
export async function buildSemanticChangelogHeadless(config, opts = {}) {
  const { pendingTag } = opts;

  const CHANGELOG_PATH = resolve(config.changelog.path);
  const tagEntries = parseAllTagsWithCommits(config, process.cwd(), { pendingTag });

  if (tagEntries.length === 0) {
    console.log(chalk.yellow("  ⚠ No tags found. Skipping changelog.\n"));
    return { saved: false, path: null };
  }

  const fullContent = buildFullChangelogContent(tagEntries, config);

  writeFileSync(CHANGELOG_PATH, fullContent, "utf-8");
  console.log(chalk.green(`  ✔ Changelog regenerated at: ${CHANGELOG_PATH}\n`));
  return { saved: true, path: CHANGELOG_PATH };
}

/**
 * Main entry point — dispatches to the correct mode based on config and context.
 *
 * | semantic | headless | function called                        |
 * |----------|----------|----------------------------------------|
 * | false    | false    | buildChangelog (manual interactive)    |
 * | false    | true     | buildChangelogHeadless (no-op)         |
 * | true     | false    | buildSemanticChangelogInteractive (*)  |
 * | true     | true     | buildSemanticChangelogHeadless         |
 *
 * (*) interactive semantic mode requires a `pendingTag` — only meaningful
 *     inside a release flow. When called standalone (vit changelog) it falls
 *     back to manual interactive mode.
 *
 * @param {object}  config
 * @param {object}  opts
 * @param {boolean} opts.headless
 * @param {string}  [opts.pendingTag]   — required for MODE 3
 */
export async function runChangelog(config, opts = {}) {
  const { headless = false, pendingTag } = opts;
  const semantic = config.changelog?.semantic === true;

  if (!semantic) {
    // MODE 1 or 2
    if (headless) return buildChangelogHeadless();
    return buildChangelog(config);
  }

  // MODE 3 or 4
  if (headless) {
    return buildSemanticChangelogHeadless(config, { pendingTag });
  }

  // MODE 3 — interactive semantic, only during release
  if (!pendingTag) {
    // Called as standalone `vit changelog` — fall back to manual interactive
    console.log(chalk.dim("  ℹ Semantic mode active but no pending tag — using manual mode.\n"));
    return buildChangelog(config);
  }

  return buildSemanticChangelogInteractive(config, pendingTag);
}

/**
 * Kept for backwards compatibility with existing callers that import
 * buildSemanticChangelog directly. Delegates to the headless variant.
 *
 * @deprecated Use runChangelog() instead.
 */
export async function buildSemanticChangelog(config, opts = {}) {
  const { headless = false, pendingTag } = opts;
  if (headless) return buildSemanticChangelogHeadless(config, { pendingTag });
  return buildSemanticChangelogInteractive(config, pendingTag ?? "");
}

/**
 * Edit an existing changelog section interactively.
 * Available in manual mode only.
 */
export async function editChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  ✏️  EDIT EXISTING CHANGELOG") + "\n");

  const CHANGELOG_PATH = resolve(config.changelog.path);

  if (!existsSync(CHANGELOG_PATH)) {
    console.log(chalk.red("\n  ✖ File not found at that path.\n"));
    return;
  }

  const sections = parseSections(CHANGELOG_PATH);

  if (sections.length === 0) {
    console.log(chalk.yellow("\n  ⚠ No sections found in the changelog.\n"));
    return;
  }

  const { selectedHeader } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedHeader",
      message: "Select the version to edit:",
      choices: sections.map((s) => ({
        name: s.header.replace("## ", ""),
        value: s.header,
      })),
    },
  ]);

  const section = sections.find((s) => s.header === selectedHeader);

  console.log("\n" + chalk.dim("  Current section:"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(chalk.dim(section.raw.trim()));
  console.log(chalk.dim("─".repeat(50)) + "\n");

  const { entries, intro } = await collectEntries(config);
  const newRaw = injectEntriesToSection(section.raw, entries, config, intro);

  console.log("\n" + chalk.yellow.bold("  Preview of the modified section:"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(newRaw.trim());
  console.log(chalk.dim("─".repeat(50)));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Save changes?",
      default: true,
    },
  ]);

  if (confirm) {
    replaceSectionInFile(CHANGELOG_PATH, section, newRaw);
    console.log(chalk.green(`\n  ✔ Section updated in: ${CHANGELOG_PATH}\n`));
  } else {
    console.log(chalk.yellow("\n  ⚠ Changes discarded.\n"));
  }
}
