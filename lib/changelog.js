import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import inquirer from "inquirer";
import chalk from "chalk";

const TYPE_LABELS = {
  feat: "🚀 Funcionalidades",
  fix: "🐛 Corrección de errores",
  refactor: "🚜 Cambios sustanciales",
  perf: "⚡ Rendimiento",
  revert: "◀️ Revertido",
  docs: "📚 Documentación",
  style: "🎨 Estilos",
};

const TYPE_ORDER = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "revert",
  "docs",
  "style",
];

function today() {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildSection(version, entries, intro = null) {
  const groups = {};
  for (const entry of entries) {
    if (!groups[entry.type]) groups[entry.type] = [];
    groups[entry.type].push(entry);
  }

  let md = `## [${version}] - ${today()}\n\n`;
  if (intro) md += `> ${intro}\n\n`;

  const sorted = Object.entries(groups).sort(
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99),
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function injectEntriesToSection(sectionRaw, newEntries, intro = null) {
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
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99),
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

const ENTRY_PROMPTS = [
  {
    type: "list",
    name: "type",
    message: "Tipo de cambio:",
    choices: [
      { name: "🚀 feat     — Nueva funcionalidad", value: "feat" },
      { name: "🐛 fix      — Corrección de bug", value: "fix" },
      { name: "🚜 refactor — Refactorización", value: "refactor" },
      { name: "⚡ perf     — Mejora de rendimiento", value: "perf" },
      { name: "📚 docs     — Documentación", value: "docs" },
      { name: "🎨 style    — Estilos / UI", value: "style" },
      { name: "◀️ revert    — Reversión de cambio", value: "revert" },
    ],
  },
  {
    type: "input",
    name: "scope",
    message: "Scope (opcional — Enter para omitir):",
  },
  {
    type: "input",
    name: "description",
    message: "Descripción del cambio:",
    validate: (v) =>
      v.trim().length > 0 || "La descripción no puede estar vacía",
  },
  {
    type: "confirm",
    name: "breaking",
    message: "¿Es un breaking change?",
    default: false,
  },
];

async function recogerEntradas() {
  const entries = [];
  let addingEntries = true;

  const { intro } = await inquirer.prompt([
    {
      type: "input",
      name: "intro",
      message:
        "Texto introductorio antes de las nuevas entradas (Enter para omitir):",
    },
  ]);

  while (addingEntries) {
    const entry = await inquirer.prompt(ENTRY_PROMPTS);
    entries.push({
      type: entry.type,
      scope: entry.scope.trim() || null,
      description: entry.description.trim(),
      breaking: entry.breaking,
    });
    console.log(chalk.green("  ✔ Entrada añadida"));
    const { more } = await inquirer.prompt([
      {
        type: "confirm",
        name: "more",
        message: "¿Añadir otra entrada?",
        default: true,
      },
    ]);
    addingEntries = more;
  }

  return { entries, intro: intro.trim() || null };
}

async function pedirRuta(config) {
  const { changelogPath } = await inquirer.prompt([
    {
      type: "input",
      name: "changelogPath",
      message: "Ruta del archivo changelog:",
      default: config.changelog.path,
      validate: (v) => v.trim().length > 0 || "La ruta no puede estar vacía",
    },
  ]);
  return resolve(changelogPath.trim());
}

export async function buildChangelog(config) {
  console.log("\n" + chalk.cyan.bold("  📋 CHANGELOG MANUAL") + "\n");

  const CHANGELOG_PATH = await pedirRuta(config);

  const { version } = await inquirer.prompt([
    {
      type: "input",
      name: "version",
      message: "Título / versión de esta entrada (ej: 1.2.0):",
      validate: (v) => v.trim().length > 0 || "Introduce un título",
    },
  ]);

  const { entries, intro } = await recogerEntradas();
  const section = buildSection(version, entries, intro);

  console.log("\n" + chalk.yellow.bold("  Vista previa del changelog:"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(section);
  console.log(chalk.dim("─".repeat(50)));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "¿Guardar este changelog?",
      default: true,
    },
  ]);

  if (confirm) {
    prependToChangelog(section, CHANGELOG_PATH, config.changelog.title);
    console.log(chalk.green(`\n  ✔ Guardado en: ${CHANGELOG_PATH}\n`));
  } else {
    console.log(
      chalk.yellow("\n  ⚠ Changelog descartado, continuando sin él...\n"),
    );
  }
}

export async function editChangelog(config) {
  console.log(
    "\n" + chalk.cyan.bold("  ✏️  EDITAR CHANGELOG EXISTENTE") + "\n",
  );

  const CHANGELOG_PATH = await pedirRuta(config);

  if (!existsSync(CHANGELOG_PATH)) {
    console.log(chalk.red("\n  ✖ El archivo no existe en esa ruta.\n"));
    return;
  }

  const sections = parseSections(CHANGELOG_PATH);

  if (sections.length === 0) {
    console.log(
      chalk.yellow("\n  ⚠ No se encontraron secciones en el changelog.\n"),
    );
    return;
  }

  const { selectedHeader } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedHeader",
      message: "Selecciona la versión a editar:",
      choices: sections.map((s) => ({
        name: s.header.replace("## ", ""),
        value: s.header,
      })),
    },
  ]);

  const section = sections.find((s) => s.header === selectedHeader);

  console.log("\n" + chalk.dim("  Sección actual:"));
  console.log(chalk.dim("─".repeat(50)));
  console.log(chalk.dim(section.raw.trim()));
  console.log(chalk.dim("─".repeat(50)) + "\n");

  const { entries, intro } = await recogerEntradas();
  const newRaw = injectEntriesToSection(section.raw, entries, intro);

  console.log(
    "\n" + chalk.yellow.bold("  Vista previa de la sección modificada:"),
  );
  console.log(chalk.dim("─".repeat(50)));
  console.log(newRaw.trim());
  console.log(chalk.dim("─".repeat(50)));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "¿Guardar los cambios?",
      default: true,
    },
  ]);

  if (confirm) {
    replaceSectionInFile(CHANGELOG_PATH, section, newRaw);
    console.log(
      chalk.green(`\n  ✔ Sección actualizada en: ${CHANGELOG_PATH}\n`),
    );
  } else {
    console.log(chalk.yellow("\n  ⚠ Cambios descartados.\n"));
  }
}