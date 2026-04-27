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

/**
 * Returns all tags sorted by the date of the commit they point to,
 * most recent first.
 */
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

/**
 * Returns the ISO date (YYYY-MM-DD) of a tag's commit.
 */
function getTagDate(tag, cwd = process.cwd()) {
  try {
    return gitExec(`git log -1 --format=%ai "${tag}"`, cwd).split(" ")[0];
  } catch {
    return null;
  }
}

/**
 * Returns the commit subjects between two refs.
 * `from` is exclusive, `to` is inclusive.
 * If `from` is null, returns all commits up to `to`.
 */
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

/**
 * Returns the commit subjects from `from` (exclusive) up to HEAD.
 * If `from` is null, returns all commits up to HEAD.
 */
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
 * When `pendingTag` is provided (e.g. during a release before the tag is
 * created), a virtual entry is prepended for the commits that exist between
 * the most-recent tag and HEAD. This ensures the upcoming release is included
 * in the generated changelog even though the tag does not exist yet.
 *
 * Shape: Array<{ tag: string, date: string | null, commits: ParsedCommit[], pending?: true }>
 *
 * @param {object}        config
 * @param {string}        [cwd]
 * @param {{ pendingTag?: string }} [opts]
 */
export function parseAllTagsWithCommits(config, cwd = process.cwd(), opts = {}) {
  const { pendingTag } = opts;
  const knownTypes = new Set(config.types.map((t) => t.value));
  const tags = getAllTagsSorted(cwd);

  const result = [];

  // ── Virtual entry for unreleased commits (pending tag) ────────────────────
  if (pendingTag) {
    const mostRecentTag = tags[0] ?? null;
    const rawLines = getCommitsToHead(mostRecentTag, cwd);
    const commits = rawLines
      .map(parseCommit)
      .filter((c) => c !== null && knownTypes.has(c.type));

    // Only include the pending entry if there are recognised commits to show.
    // Even with 0 commits we still add it so the version header appears in
    // the changelog (the release itself is the event worth recording).
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

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * Manual changelog: the user types every entry interactively.
 * Used when config.changelog.semanticChangelog === false (default).
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
 * Semantic changelog: regenerates the FULL changelog from scratch by
 * iterating over every git tag in reverse-chronological order and collecting
 * the conventional commits between consecutive tags.
 *
 * Any existing changelog file is completely overwritten.
 *
 * When `opts.pendingTag` is provided the function prepends a virtual section
 * for the commits that exist between the latest tag and HEAD (i.e. the commits
 * that belong to the release being created but whose tag does not exist yet).
 * This is the standard path when called from the release flow.
 *
 * Behaviour:
 *   interactive — shows a preview and asks for confirmation before writing.
 *   headless    — writes directly with no prompts.
 *
 * @param {object} config
 * @param {{ headless?: boolean, pendingTag?: string }} [opts]
 * @returns {Promise<{ saved: boolean, path: string | null }>}
 */
export async function buildSemanticChangelog(config, opts = {}) {
  const { headless = false, pendingTag } = opts;

  if (!headless) {
    console.log(
      "\n" +
        chalk.cyan.bold("  🤖 SEMANTIC CHANGELOG — full regeneration") +
        (pendingTag ? chalk.dim(` (pending: ${pendingTag})`) : "") +
        "\n",
    );
  }

  const CHANGELOG_PATH = resolve(config.changelog.path);

  // ── Parse all tags + optional pending entry ────────────────────────────────
  const tagEntries = parseAllTagsWithCommits(config, process.cwd(), { pendingTag });

  if (tagEntries.length === 0) {
    console.log(
      chalk.yellow(
        "  ⚠ No tags found in the repository. Nothing to generate.\n",
      ),
    );
    return { saved: false, path: null };
  }

  const totalCommits = tagEntries.reduce((n, e) => n + e.commits.length, 0);

  if (pendingTag) {
    const pendingEntry = tagEntries[0];
    console.log(
      chalk.dim(
        `  Pending tag     : ${pendingTag} (${pendingEntry.commits.length} commit(s) since last tag)`,
      ),
    );
  }

  console.log(
    chalk.dim(
      `  Found ${tagEntries.length - (pendingTag ? 1 : 0)} existing tag(s) · ${totalCommits} recognised commit(s) total\n`,
    ),
  );

  // ── Build full changelog content ───────────────────────────────────────────
  const title = config.changelog.title ?? "Changelog";
  let fullContent = `# ${title}\n\n`;

  for (const { tag, date, commits } of tagEntries) {
    if (commits.length !== 0) {
      fullContent += buildSection(tag, commits, config, null, date);
    }
  }

  // ── Preview & confirm (interactive only) ──────────────────────────────────
  if (!headless) {
    console.log(
      "\n" + chalk.yellow.bold("  Changelog preview (first 80 lines):"),
    );
    console.log(chalk.dim("─".repeat(50)));
    const lines = fullContent.split("\n");
    console.log(chalk.dim(lines.slice(0, 80).join("\n")));
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
  }

  // ── Write (overwrites entirely) ────────────────────────────────────────────
  writeFileSync(CHANGELOG_PATH, fullContent, "utf-8");
  console.log(
    chalk.green(`\n  ✔ Changelog regenerated at: ${CHANGELOG_PATH}\n`),
  );
  return { saved: true, path: CHANGELOG_PATH };
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
