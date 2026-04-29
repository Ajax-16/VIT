import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import semver from "semver";

// ── Helpers derived from config ────────────────────────────────────────────

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

// ── Utils ──────────────────────────────────────────────────────────────────────

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

// ── Git helpers ────────────────────────────────────────────────────────────────

function getAllTagsSorted(cwd = process.cwd()) {
  try {
    const raw = gitExec("git tag --sort=-creatordate", cwd);
    return raw
      ? raw
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
      : [];
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
      ? raw
        .split("\n")
        .map((l) => l.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
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
      ? raw
        .split("\n")
        .map((l) => l.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function isPreReleaseTag(tagName, preReleaseBranches = []) {
  const versionPart = tagName.replace(/^[a-zA-Z]+-?/, "");
  if (semver.prerelease(versionPart)) return true;
  const knownIds = preReleaseBranches
    .map((b) => (typeof b === "string" ? b : (b?.id ?? b?.name)))
    .filter(Boolean);
  return knownIds.some((id) => tagName.includes(`-${id}.`));
}

// ── Changelog file helpers ────────────────────────────────────────────────────

/**
 * Returns true if the changelog file exists AND has at least one `## ` section.
 * Files that only contain the `# Title` header count as empty.
 */
function changelogHasSections(filePath) {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf-8");
  return /^## /m.test(content);
}

/**
 * Returns the header line of the first `## ` section found in the existing
 * changelog, or null if there are none. Used to detect duplicate sections.
 */
function getSectionHeaders(filePath) {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8");
  const headers = new Set();
  for (const match of content.matchAll(/^## \[([^\]]+)\]/gm)) {
    headers.add(match[1]);
  }
  return headers;
}

// ── Conventional commit parser ──────────────────────────────────────────────────

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
 * Prerelease tags are NOT emitted as separate entries. Instead, their
 * commits are accumulated and merged into the next stable tag entry that
 * follows them chronologically.
 *
 * When `pendingTag` is provided a virtual entry is prepended for the commits
 * between the most-recent stable tag and HEAD.
 *
 * Shape: Array<{ tag, date, commits, pending? }>
 */
export function parseAllTagsWithCommits(
  config,
  cwd = process.cwd(),
  opts = {},
) {
  const { pendingTag } = opts;
  const knownTypes = new Set(config.types.map((t) => t.value));
  const preReleaseBranches = config.git?.preReleaseBranches ?? [];
  const tags = getAllTagsSorted(cwd);

  const result = [];

  if (pendingTag) {
    const mostRecentStable =
      tags.find((t) => !isPreReleaseTag(t, preReleaseBranches)) ?? null;
    const rawLines = getCommitsToHead(mostRecentStable, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));
    result.push({ tag: pendingTag, date: null, commits, pending: true });
  }

  if (tags.length === 0) return result;

  let i = 0;
  while (i < tags.length) {
    const tag = tags[i];

    if (isPreReleaseTag(tag, preReleaseBranches)) {
      i++;
      continue;
    }

    const prevStableIdx = tags.findIndex(
      (t, idx) => idx > i && !isPreReleaseTag(t, preReleaseBranches),
    );
    const prevStableTag = prevStableIdx !== -1 ? tags[prevStableIdx] : null;

    const date = getTagDate(tag, cwd);
    const rawLines = getCommitsBetween(prevStableTag, tag, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));

    result.push({ tag, date, commits });
    i++;
  }

  return result;
}

/**
 * Returns only the commits between the last stable tag and HEAD, parsed and
 * filtered by known types.
 */
export function parseCommitsSinceLastTag(config, cwd = process.cwd()) {
  const knownTypes = new Set(config.types.map((t) => t.value));
  const preReleaseBranches = config.git?.preReleaseBranches ?? [];
  const tags = getAllTagsSorted(cwd);
  const lastStableTag =
    tags.find((t) => !isPreReleaseTag(t, preReleaseBranches)) ?? null;
  const rawLines = getCommitsToHead(lastStableTag, cwd);
  return rawLines
    .map(parseCommit)
    .filter((c) => c !== null && knownTypes.has(c.type));
}

/**
 * Returns only the entry for the most recent stable tag (or pendingTag if
 * provided). Used when the changelog already has content and we only want
 * to prepend the new section.
 */
function getLatestTagEntry(config, cwd = process.cwd(), opts = {}) {
  const { pendingTag } = opts;
  const knownTypes = new Set(config.types.map((t) => t.value));
  const preReleaseBranches = config.git?.preReleaseBranches ?? [];
  const tags = getAllTagsSorted(cwd);

  if (pendingTag) {
    const mostRecentStable =
      tags.find((t) => !isPreReleaseTag(t, preReleaseBranches)) ?? null;
    const rawLines = getCommitsToHead(mostRecentStable, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));
    return { tag: pendingTag, date: null, commits, pending: true };
  }

  const latestStable = tags.find((t) => !isPreReleaseTag(t, preReleaseBranches));
  if (!latestStable) return null;

  const prevStableIdx = tags.findIndex(
    (t, idx) => idx > tags.indexOf(latestStable) && !isPreReleaseTag(t, preReleaseBranches),
  );
  const prevStableTag = prevStableIdx !== -1 ? tags[prevStableIdx] : null;

  const date = getTagDate(latestStable, cwd);
  const rawLines = getCommitsBetween(prevStableTag, latestStable, cwd);
  const commits = rawLines
    .map(parseCommit)
    .filter((c) => c !== null && knownTypes.has(c.type));

  return { tag: latestStable, date, commits };
}

// ── Build helpers ──────────────────────────────────────────────────────────────────

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
      const breaking = item.breaking ? `**\u2757** ` : "";
      md += `- ${scope}${breaking}${item.description}\n\n`;
    }
    md += "\n";
  }

  return md;
}

/**
 * Prepends `newSection` to the changelog file.
 *
 * Safety rules:
 *  1. Strips ALL existing `# <title>` headers so only one survives at the top.
 *  2. Skips writing if a section with the same `## [tag]` header already exists
 *     (idempotent — safe to call multiple times with the same tag).
 */
function prependToChangelog(newSection, filePath, title) {
  const header = `# ${title}`;

  // Extract the tag id from the new section header, e.g. "v1.2.0"
  const newTagMatch = newSection.match(/^## \[([^\]]+)\]/);
  const newTag = newTagMatch ? newTagMatch[1] : null;

  let body = "";

  if (existsSync(filePath)) {
    let existing = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

    // Guard: if this tag is already present, skip to avoid duplicates
    if (newTag && new RegExp(`^## \\[${escapeRegex(newTag)}\\]`, "m").test(existing)) {
      return;
    }

    // Strip every `# <title>` header line (and the blank line after it) so we
    // can re-add exactly one clean header at the top.
    existing = existing.replace(/^# .+\n(\n)?/gm, "").trimStart();
    body = existing;
  }

  const newContent = body
    ? `${header}\n\n${newSection}\n${body}`
    : `${header}\n\n${newSection}`;

  writeFileSync(filePath, newContent, "utf-8");
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
        const breaking = item.breaking ? `**\u2757** ` : "";
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
        Object.entries(TYPE_LABELS).find(([, v]) => v === headerLine)?.[0] ??
        headerLine;
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
              Object.entries(TYPE_LABELS).find(
                ([, v]) => v === headerLine,
              )?.[0] ?? headerLine;
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
  const updated =
    content.slice(0, section.start) + newRaw + content.slice(section.end);
  writeFileSync(filePath, updated);
}

// ── Prompts ────────────────────────────────────────────────────────────────────────

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
      message:
        "Introductory text before the new entries (press Enter to skip):",
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

// ── Exports ────────────────────────────────────────────────────────────────────────

/**
 * MODE 1 — Manual changelog (interactive).
 * User types every entry manually.
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
    console.log(
      chalk.yellow("\n  ⚠ Changelog discarded, continuing without it...\n"),
    );
  }
}

/**
 * MODE 2 — Semantic changelog interactive.
 * Lets the user pick which commits to include in the new section.
 * - If the changelog has no sections yet → regenerates the full file.
 * - If the changelog already has sections → prepends only the new section.
 */
export async function buildSemanticChangelogInteractive(config, pendingTag) {
  console.log(
    "\n" +
    chalk.cyan.bold("  🤖 SEMANTIC CHANGELOG") +
    chalk.dim(` — selecting commits for ${pendingTag}`) +
    "\n",
  );

  const CHANGELOG_PATH = resolve(config.changelog.path);

  const candidates = parseCommitsSinceLastTag(config);

  if (candidates.length === 0) {
    console.log(
      chalk.yellow(
        "  ⚠ No conventional commits found since last stable tag. Skipping changelog.\n",
      ),
    );
    return { saved: false, path: null };
  }

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

  const { intro } = await inquirer.prompt([
    {
      type: "input",
      name: "intro",
      message: "Introductory text for this release (press Enter to skip):",
    },
  ]);

  const spinner = ora({ text: "Generating changelog...", color: "blue" }).start();

  const hasContent = changelogHasSections(CHANGELOG_PATH);
  const section = buildSection(pendingTag, chosenCommits, config, intro?.trim() || null);

  let fullContent;
  if (!hasContent) {
    // First time or empty file — build the full history
    const tagEntries = parseAllTagsWithCommits(config, process.cwd(), { pendingTag });
    if (tagEntries.length > 0 && tagEntries[0].pending) {
      tagEntries[0].commits = chosenCommits;
      if (intro?.trim()) tagEntries[0].intro = intro.trim();
    }
    fullContent = `# ${config.changelog.title ?? "Changelog"}\n\n`;
    for (const { tag, date, commits, intro: entryIntro } of tagEntries) {
      if (commits.length > 0) {
        fullContent += buildSection(tag, commits, config, entryIntro ?? null, date);
      }
    }
  }

  spinner.succeed(chalk.green("Changelog generated"));

  console.log("\n" + chalk.yellow.bold("  Changelog preview (first 80 lines):"));
  console.log(chalk.dim("─".repeat(50)));
  const previewContent = fullContent ?? section;
  const lines = previewContent.split("\n");
  console.log(lines.slice(0, 80).join("\n"));
  if (lines.length > 80) console.log(chalk.dim("  … (truncated)"));
  console.log(chalk.dim("─".repeat(50)));

  const confirmMsg = hasContent
    ? `Prepend this section to ${CHANGELOG_PATH}?`
    : `Overwrite ${CHANGELOG_PATH} with the generated changelog?`;

  const { confirm } = await inquirer.prompt([
    { type: "confirm", name: "confirm", message: confirmMsg, default: true },
  ]);

  if (!confirm) {
    console.log(chalk.yellow("\n  ⚠ Changelog generation cancelled.\n"));
    return { saved: false, path: null };
  }

  if (hasContent) {
    prependToChangelog(section, CHANGELOG_PATH, config.changelog.title ?? "Changelog");
    console.log(chalk.green(`\n  ✔ Section prepended to: ${CHANGELOG_PATH}\n`));
  } else {
    writeFileSync(CHANGELOG_PATH, fullContent, "utf-8");
    console.log(chalk.green(`\n  ✔ Changelog generated at: ${CHANGELOG_PATH}\n`));
  }

  return { saved: true, path: CHANGELOG_PATH };
}

/**
 * MODE 3 — Semantic changelog non-interactive (--yes).
 *
 * - If the changelog has no sections → regenerates the full file from all tags.
 * - If the changelog already has sections → prepends only the latest tag section.
 */
export async function buildSemanticChangelogAuto(config, opts = {}) {
  const { pendingTag } = opts;

  const spinner = ora({ text: "Generating changelog...", color: "blue" }).start();

  const CHANGELOG_PATH = resolve(config.changelog.path);
  const hasContent = changelogHasSections(CHANGELOG_PATH);

  if (hasContent) {
    // Incremental: only prepend the latest tag (or pendingTag) section
    const entry = getLatestTagEntry(config, process.cwd(), { pendingTag });

    if (!entry || entry.commits.length === 0) {
      spinner.warn(chalk.yellow("No new commits to add to changelog."));
      return { saved: false, path: null };
    }

    const section = buildSection(entry.tag, entry.commits, config, null, entry.date);
    prependToChangelog(section, CHANGELOG_PATH, config.changelog.title ?? "Changelog");
    spinner.succeed(chalk.green(`Section [${entry.tag}] prepended to: ${CHANGELOG_PATH}\n`));
    return { saved: true, path: CHANGELOG_PATH };
  }

  // Full regeneration: file is absent or has no sections
  const tagEntries = parseAllTagsWithCommits(config, process.cwd(), { pendingTag });

  if (tagEntries.length === 0) {
    spinner.warn(chalk.yellow("No tags found. Skipping changelog."));
    return { saved: false, path: null };
  }

  const fullContent = buildFullChangelogContent(tagEntries, config);
  writeFileSync(CHANGELOG_PATH, fullContent, "utf-8");
  spinner.succeed(chalk.green(`Changelog generated at: ${CHANGELOG_PATH}\n`));
  return { saved: true, path: CHANGELOG_PATH };
}

/**
 * Main entry point — dispatches to the correct mode.
 *
 * | semantic | yes   | pendingTag | function called                         |
 * |----------|-------|------------|-----------------------------------------|
 * | false    | false | any        | buildChangelog (manual interactive)     |
 * | false    | true  | any        | no-op (skip)                            |
 * | true     | false | undefined  | buildSemanticChangelogAuto              |
 * | true     | false | set        | buildSemanticChangelogInteractive       |
 * | true     | true  | any        | buildSemanticChangelogAuto              |
 */
export async function runChangelog(config, opts = {}) {
  const { yes = false, pendingTag, semanticChangelog } = opts;
  const semantic =
    config.changelog?.semantic === true || semanticChangelog === true;

  if (!semantic) {
    if (yes) {
      console.log(chalk.dim("  ℹ Changelog skipped (non-semantic --yes mode).\n"));
      return { saved: false };
    }
    return buildChangelog(config);
  }

  if (yes) {
    return buildSemanticChangelogAuto(config, { pendingTag });
  }

  if (!pendingTag) {
    return buildSemanticChangelogAuto(config);
  }

  return buildSemanticChangelogInteractive(config, pendingTag);
}

/**
 * @deprecated Use runChangelog() instead.
 */
export async function buildSemanticChangelog(config, opts = {}) {
  const { yes = false, pendingTag } = opts;
  if (yes) return buildSemanticChangelogAuto(config, { pendingTag });
  return buildSemanticChangelogInteractive(config, pendingTag ?? "");
}

/**
 * Edit an existing changelog section interactively.
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
