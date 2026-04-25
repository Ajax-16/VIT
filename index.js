#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { bump } from "./lib/bump.js";
import { buildChangelog, editChangelog } from "./lib/changelog.js";
import { loadVitConfig } from "./lib/config.js";
import {
  getVcsAdapter,
  vcsLabel,
} from "./lib/vcs/index.js";

const config = loadVitConfig();
const vcs = getVcsAdapter(config.vcs?.provider ?? "git");

console.log(
  "\n" +
  chalk.bgHex("#046c04").white.bold("  VIT  ") +
  " " +
  chalk.hex("#046c04").bold("Version It!") +
  "\n",
);

const branch = vcs.getCurrentBranch();
const lastTag = vcs.getLastTag();

console.log(chalk.dim(`  VCS         : `) + chalk.cyan(vcsLabel(config.vcs?.provider)));
console.log(chalk.dim(`  Rama actual : `) + chalk.cyan(branch ?? "-"));
if (lastTag) console.log(chalk.dim(`  Último tag  : `) + chalk.cyan(lastTag));
console.log();

const { accion } = await inquirer.prompt([
  {
    type: "list",
    name: "accion",
    message: "¿Qué quieres hacer?",
    choices: [
      {
        name: "🚀  Nueva versión  — bump + changelog + commit",
        value: "release",
      },
      {
        name: "📋  Solo changelog — añadir o editar entradas",
        value: "changelog",
      },
      { name: "💾  Solo commit    — commit y push sin bump", value: "commit" },
      { name: "⏪  Rollback       — retroceder a un tag", value: "rollback" },
      { name: "❌  Salir", value: "exit" },
    ],
  },
]);

if (accion === "exit") {
  console.log(chalk.dim("\n  Hasta luego.\n"));
  process.exit(0);
}

if ((accion === "commit" || accion === "rollback") && !vcs.supportsVersioning()) {
  console.log(
    chalk.yellow(
      `\n  ⚠ El proveedor VCS actual (${vcsLabel(config.vcs?.provider)}) no soporta esta operación.\n`,
    ),
  );
  process.exit(0);
}

if (accion === "rollback") {
  const tags = vcs.getAllTags();

  if (tags.length === 0) {
    console.log(chalk.yellow("\n  ⚠ No hay tags disponibles.\n"));
    process.exit(0);
  }

  const { selectedTag } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTag",
      message: "Selecciona el tag al que retroceder:",
      choices: tags.map((t) => ({ name: t, value: t })),
      pageSize: 15,
    },
  ]);

  const { confirmRollback } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmRollback",
      message: chalk.yellow(
        `¿Confirmar rollback a ${selectedTag}? Esto modificará el historial.`,
      ),
      default: false,
    },
  ]);

  if (!confirmRollback) {
    console.log(chalk.yellow("\n  Rollback cancelado.\n"));
    process.exit(0);
  }

  const spinner = ora({
    text: "Ejecutando rollback...",
    color: "yellow",
  }).start();

  try {
    vcs.rollbackToTag(selectedTag);
    spinner.succeed(chalk.green(`Rollback a ${selectedTag} completado.`));
    console.log(chalk.dim("\n  Los archivos han vuelto al estado del tag."));

    if (vcs.supportsPush()) {
      console.log(
        chalk.dim(
          "  Usa un push forzado si necesitas subir el rollback al remoto.\n",
        ),
      );
    } else {
      console.log();
    }
  } catch (err) {
    spinner.fail(chalk.red("Error durante el rollback"));
    console.error("\n" + chalk.red(err.message) + "\n");
    process.exit(1);
  }

  const tagsAfter = vcs.getTagsAfter(selectedTag);

  if (tagsAfter.length > 0) {
    console.log(chalk.dim(`\n  Tags posteriores a ${selectedTag}:`));
    tagsAfter.forEach((t) => console.log(chalk.dim(`    · ${t}`)));
    console.log();

    const { deleteTags } = await inquirer.prompt([
      {
        type: "confirm",
        name: "deleteTags",
        message: chalk.yellow(
          `¿Eliminar estos ${tagsAfter.length} tag(s)?`,
        ),
        default: false,
      },
    ]);

    if (deleteTags) {
      const spinnerTags = ora({
        text: "Eliminando tags...",
        color: "yellow",
      }).start();

      try {
        for (const t of tagsAfter) {
          vcs.deleteTag(t);
        }
        spinnerTags.succeed(
          chalk.green(`${tagsAfter.length} tag(s) eliminados.`),
        );
      } catch (err) {
        spinnerTags.fail(chalk.red("Error eliminando tags"));
        console.error("\n" + chalk.red(err.message) + "\n");
      }
    } else {
      console.log(chalk.dim("  Tags conservados.\n"));
    }
  }

  process.exit(0);
}

let bumpResult = null;
let changelogAction = "none";
let commitMessage = null;

if (accion === "release") {
  const configuredProjects = config.projects ?? [];

  if (configuredProjects.length === 0) {
    console.log(chalk.red("\n  ✖ No hay proyectos configurados en vit-config.json.\n"));
    process.exit(1);
  }

  let targets;

  if (configuredProjects.length === 1) {
    targets = [configuredProjects[0].id];
    console.log(
      chalk.green(
        `\n  ✔ Proyecto seleccionado automáticamente: ${configuredProjects[0].label} (${configuredProjects[0].id})\n`,
      ),
    );
  } else {
    const projectChoices = [
      { name: "all — Todos los proyectos configurados", value: "__all__" },
      ...configuredProjects.map((project) => ({
        name: `${project.id} — ${project.label} (${project.path})`,
        value: project.id,
      })),
    ];

    const bumpAnswers = await inquirer.prompt([
      {
        type: "checkbox",
        name: "targets",
        message: "¿Qué proyectos versionar?",
        choices: projectChoices,
        validate: (value) =>
          value.length > 0 || "Debes seleccionar al menos un proyecto",
      },
    ]);

    targets = bumpAnswers.targets.includes("__all__")
      ? configuredProjects.map((p) => p.id)
      : bumpAnswers.targets;
  }

  const { bumpType } = await inquirer.prompt([
    {
      type: "list",
      name: "bumpType",
      message: "¿Tipo de bump?",
      choices: [
        { name: "patch — Corrección menor    (x.x.+1)", value: "patch" },
        { name: "minor — Nueva funcionalidad  (x.+1.0)", value: "minor" },
        { name: "major — Cambio grande        (+1.0.0)", value: "major" },
      ],
      default: "patch",
    },
  ]);

  bumpResult = {
    targets,
    bumpType,
  };

  console.log(
    chalk.green(
      `\n  ✔ Bump configurado: ${bumpType} → ${targets.join(", ")}\n`,
    ),
  );
}

if (accion === "release" || accion === "changelog") {
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "¿Qué hacer con el changelog?",
        choices: [
          { name: "No tocar el changelog", value: "none" },
          { name: "Añadir nueva entrada", value: "add" },
          { name: "Editar versión existente", value: "edit" },
        ],
        default: "none",
      },
    ]);

    if (action === "none") break;
    if (action === "add") await buildChangelog(config);
    if (action === "edit") await editChangelog(config);

    changelogAction = action;
  }
}

if (accion !== "changelog") {
  const defaultMessage =
    accion === "release"
      ? config.git.releaseCommitMessage
      : config.git.defaultCommitMessage;

  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: vcs.supportsCommit()
        ? "Mensaje de commit:"
        : "Mensaje descriptivo de la operación:",
      default: defaultMessage,
      validate: (v) => v.trim().length > 0 || "El mensaje no puede estar vacío",
    },
  ]);
  commitMessage = message;
}

console.log("\n" + chalk.bold("  Resumen de la operación:"));
console.log(chalk.dim("  ─────────────────────────"));
console.log(`  Acción    : ${chalk.cyan(accion)}`);
console.log(`  VCS       : ${chalk.cyan(vcsLabel(config.vcs?.provider))}`);
if (bumpResult) {
  console.log(`  Targets   : ${chalk.cyan(bumpResult.targets.join(", "))}`);
  console.log(`  Bump      : ${chalk.cyan(bumpResult.bumpType)}`);
}
if (commitMessage) {
  console.log(`  Mensaje   : ${chalk.cyan(commitMessage)}`);
}
console.log(
  `  Changelog : ${changelogAction === "add"
    ? chalk.green("nueva entrada")
    : changelogAction === "edit"
      ? chalk.yellow("editar existente")
      : chalk.dim("no")
  }`,
);
console.log();

if (accion === "changelog") {
  const canCommit = vcs.supportsCommit();

  if (!canCommit) {
    console.log(
      chalk.yellow(
        "\n  ⚠ El proveedor VCS actual no soporta commit/push. El changelog queda guardado localmente.\n",
      ),
    );
    process.exit(0);
  }

  const { doCommit } = await inquirer.prompt([
    {
      type: "confirm",
      name: "doCommit",
      message: "¿Hacer commit y push del changelog?",
      default: true,
    },
  ]);

  if (!doCommit) {
    console.log(
      chalk.yellow("\n  Changelog guardado localmente. Sin commit.\n"),
    );
    process.exit(0);
  }

  const { message } = await inquirer.prompt([
    {
      type: "input",
      name: "message",
      message: "Mensaje de commit:",
      default: config.git.changelogCommitMessage,
      validate: (v) => v.trim().length > 0 || "El mensaje no puede estar vacío",
    },
  ]);
  commitMessage = message;
} else {
  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "¿Confirmar y ejecutar?",
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("\n  Operación cancelada.\n"));
    process.exit(0);
  }
}

const spinner = ora({ text: "Ejecutando...", color: "yellow" }).start();

try {
  if (accion === "release") {
    const result = await bump({
      targets: bumpResult.targets,
      bumpType: bumpResult.bumpType,
      message: commitMessage,
      config,
      vcs,
    });

    spinner.succeed(chalk.green("¡Bump completado con éxito!"));
    console.log();

    for (const item of result.bumpedProjects) {
      console.log(`  ${item.label.padEnd(12)}: ${chalk.cyan("v" + item.version)}`);
    }

    if (result.tag) {
      console.log(`  Tag         : ${chalk.cyan(result.tag)}`);
    }

    if (!vcs.supportsVersioning()) {
      console.log(
        chalk.dim("  Nota        : se actualizaron versiones sin commit/tag/push."),
      );
    }
  } else {
    vcs.addAll();
    vcs.commit(commitMessage);
    vcs.pushWithTags();
    spinner.succeed(chalk.green("Operación completada correctamente"));
  }

  console.log();
} catch (err) {
  spinner.fail(chalk.red("Error durante la ejecución"));
  console.error("\n" + chalk.red(err.message));
  if (err.original)
    console.error(chalk.dim("  Original: " + err.original.message));
  console.error(chalk.dim("\n" + err.stack) + "\n");
  process.exit(1);
}