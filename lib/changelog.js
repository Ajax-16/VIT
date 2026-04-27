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

function today() {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Semantic commit parsing ──────────────────────────────────────────────────

/**
 * Parses conventional commits since the last git tag.
 * Returns an array of entries compatible with buildSection.
 *
 * Supported format: <type>[(<scope>)][!]: <description>
 * e.g.  feat(auth): add OAuth login
 *       fix!: correct null pointer
 */
function parseCommitsSinceLastTag(cwd = process.cwd()) {
  let range = "HEAD";

  try {
    const lastTag = execSync("git describe --tags --abbrev=0", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    range = `${lastTag}..HEAD`;
  } catch {
    // no tags yet — use all commits
  }

  let raw;
  try {
    raw = execSync(`git log ${range} --pretty=format:"%s"`, {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return [];
  }

  if (!raw) return [];

  const CONVENTIONAL_RE =
    /^(?<type>[a-z]+)(\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/;

  return raw
    .split("\n")
    .map((line) => line.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .map((line) => {
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
    })
    .filter(Boolean);
}

// ── Build ────────────────────────────────────────────────────────────────────

function buildSection(version, entries, config, intro = null) {
  const TYPE_LABELS = getTypeLabels(config);
  const TYPE_ORDER = getTypeOrder(config);

  const groups = {};
  for (const entry of entries) {
    if (!groups[entry.type]) groups[entry.type] = [];
    groups[entry.type].push(entry);
  }

  let md = `## [${version}] - ${today()}\n\n`;
  if (intro) md += `> ${intro}\n\n`;

  const sorted = Object.entries(groups).sort(
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99)
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
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99)
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
        `(### ${escapeRegex(label)}\\n[\\s\\S]*?)(?=\\n### |\\n## |$)`
      );
      sectionRaw = sectionRaw.replace(blockRegex, (match) => {
        return match.trimEnd() + "\n\n" + newLines;
      });
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
              Object.entries(TYPE_LABELS).find(([, v]) => v === headerLine)?.[0] ??
              headerLine;
            return [type, b.trimEnd()];
          })
      )
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
      validate: (v) =>
        v.trim().length > 0 || "Description cannot be empty",
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

async function askPath(config) {
  const { changelogPath } = await inquirer.prompt([
    {
      type: "input",
      name: "changelogPath",
      message: "Changelog file path:",
      default: config.changelog.path,
      validate: (v) => v.trim().length > 0 || "Path cannot be empty",
    },
  ]);
  return resolve(changelogPath.trim());
}

// ── Exports ──────────────────────────────────────────────────────────────────

export async function buildChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  📋 MANUAL CHANGELOG") + "\n");

  const CHANGELOG_PATH = await askPath(config);

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
 * Builds a changelog entry automatically from conventional commits
 * since the last git tag. Skips entries whose type is not recognised
 * by the current config's `types` list.
 *
 * Activated when `config.changelog.semanticChangelog === true`.
 */
export async function buildSemanticChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  🤖 SEMANTIC CHANGELOG") + "\n");

  const CHANGELOG_PATH = await askPath(config);

  const { version } = await inquirer.prompt([
    {
      type: "input",
      name: "version",
      message: "Version for this entry (e.g. 1.2.0):",
      validate: (v) => v.trim().length > 0 || "Please enter a version",
    },
  ]);

  const allCommits = parseCommitsSinceLastTag();

  if (allCommits.length === 0) {
    console.log(chalk.yellow("  ⚠ No conventional commits found since the last tag.\n"));
    return;
  }

  const knownTypes = new Set(config.types.map((t) => t.value));
  const recognised = allCommits.filter((c) => knownTypes.has(c.type));
  const skipped = allCommits.length - recognised.length;

  console.log(
    chalk.dim(
      `  Found ${allCommits.length} conventional commit(s)` +
        (skipped > 0 ? `, ${skipped} skipped (unknown type)` : "") +
        "\n"
    )
  );

  if (recognised.length === 0) {
    console.log(chalk.yellow("  ⚠ No commits with recognised types. Nothing to generate.\n"));
    return;
  }

  // Allow the user to review / deselect commits before saving
  const { selectedRaws } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedRaws",
      message: "Select commits to include in the changelog:",
      choices: recognised.map((c) => ({
        name: c.raw,
        value: c.raw,
        checked: true,
      })),
    },
  ]);

  const selected = recognised.filter((c) => selectedRaws.includes(c.raw));

  if (selected.length === 0) {
    console.log(chalk.yellow("\n  ⚠ No commits selected. Aborting.\n"));
    return;
  }

  const { intro } = await inquirer.prompt([
    {
      type: "input",
      name: "intro",
      message: "Introductory text (optional — press Enter to skip):",
    },
  ]);

  const section = buildSection(version, selected, config, intro.trim() || null);

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

export async function editChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  ✏️  EDIT EXISTING CHANGELOG") + "\n");

  const CHANGELOG_PATH = await askPath(config);

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
