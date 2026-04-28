// lib/init.js
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import chalk from "chalk";

const SCHEMA_URL =
  "https://raw.githubusercontent.com/Ajax-16/VIT/main/vit-config.schema.json";

const DEFAULT_CONFIG = {
  $schema: SCHEMA_URL,
  changelog: {
    path: "./CHANGELOG.md",
    title: "Changelog",
    semantic: false,
  },
  git: {
    defaultCommitMessage: "chore: update",
    releaseCommitMessage: "chore: release",
    changelogCommitMessage: "docs: update changelog",
    strict: true,
    releaseBranches: ["main"],
  },
  vcs: {
    provider: "git",
  },
  envFile: ".env",
  projects: [
    {
      id: "my-project",
      label: "My Project",
      path: ".",
      tagPrefix: "v",
    },
  ],
};

const VSCODE_SETTINGS = {
  "json.schemas": [
    {
      fileMatch: ["vit-config.json"],
      url: SCHEMA_URL,
    },
  ],
};

export function runInit(cwd = process.cwd()) {
  const configPath = resolve(cwd, "vit-config.json");
  const vscodePath = resolve(cwd, ".vscode");
  const vscodeSettingsPath = join(vscodePath, "settings.json");

  console.log();

  // 1. vit-config.json
  if (existsSync(configPath)) {
    console.log(chalk.yellow("  ⚠  vit-config.json already exists, skipping."));
  } else {
    writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
      "utf-8",
    );
    console.log(chalk.green("  ✔  vit-config.json created."));
    console.log(
      chalk.dim(
        JSON.stringify(DEFAULT_CONFIG, null, 2)
          .split("\n")
          .map((l) => "     " + l)
          .join("\n"),
      ),
    );
  }

  // 2. .vscode/settings.json
  mkdirSync(vscodePath, { recursive: true });

  if (existsSync(vscodeSettingsPath)) {
    console.log(
      chalk.yellow("  ⚠  .vscode/settings.json already exists, skipping."),
    );
    console.log(
      chalk.dim(
        `     To enable IntelliSense in an existing project, add this to .vscode/settings.json:\n` +
          chalk.cyan(
            JSON.stringify(VSCODE_SETTINGS, null, 2)
              .split("\n")
              .map((l) => "     " + l)
              .join("\n"),
          ),
      ),
    );
  } else {
    writeFileSync(
      vscodeSettingsPath,
      JSON.stringify(VSCODE_SETTINGS, null, 2) + "\n",
      "utf-8",
    );
    console.log();
    console.log(chalk.green("  ✔  .vscode/settings.json created."));
  }

  console.log(
    "\n" +
      chalk.bgHex("#046c04").white.bold("  VIT  ") +
      "  " +
      chalk.green("Project initialized. Edit vit-config.json to configure.") +
      "\n",
  );
}
