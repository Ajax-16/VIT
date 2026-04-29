import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const DEFAULT_CONFIG = {
  changelog: {
    path: "./CHANGELOG.md",
    title: "Changelog",
    semantic: false,
  },
  git: {
    defaultCommitMessage: "chore: update",
    releaseCommitMessage: "chore: version bump",
    changelogCommitMessage: "docs: update changelog",
    releaseBranches: [],
    preReleaseBranches: [],
    strict: false,
    rollbackStrategy: "revert",
    promoteStrategy: "merge",
  },
  github: {
    token: null,
    repo: null,
  },
  vcs: {
    provider: "git",
  },
  projects: [
    {
      id: "core",
      label: "Core",
      path: ".",
      tagPrefix: "core",
    },
  ],
  types: [
    {
      value: "feat",
      label: "🚀 Features",
      choiceLabel: "🚀 feat     — New feature",
    },
    {
      value: "fix",
      label: "🐛 Bug fixes",
      choiceLabel: "🐛 fix      — Bug fix",
    },
    {
      value: "refactor",
      label: "🚜 Refactoring",
      choiceLabel: "🚜 refactor — Refactoring",
    },
    {
      value: "perf",
      label: "⚡ Performance",
      choiceLabel: "⚡ perf     — Performance improvement",
    },
    {
      value: "revert",
      label: "◀️ Reverted",
      choiceLabel: "◀️  revert   — Revert change",
    },
    {
      value: "docs",
      label: "📚 Documentation",
      choiceLabel: "📚 docs     — Documentation",
    },
    {
      value: "style",
      label: "🎨 Styles",
      choiceLabel: "🎨 style    — Styles / UI",
    },
  ],
  envFile: null,
  preActions: [],
  postActions: [],
};

/**
 * Loads KEY=VALUE pairs from a .env file into process.env.
 * Skips comments and blank lines. Does not override existing env vars,
 * respecting the priority: process.env > global envFile.
 */
function loadEnvFile(envFilePath) {
  if (!envFilePath || !existsSync(envFilePath)) return;
  const content = readFileSync(envFilePath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

/**
 * Interpolates ${VAR_NAME} placeholders in a string using process.env or vit-vars.
 * Returns the original value unchanged if it is not a string.
 */
function interpolateEnv(value) {
  if (typeof value !== "string") return value;
  return value.replace(
    /\$\{([^}]+)\}/g,
    (match, key) => (key in process.env ? process.env[key] : match), // ← devuelve ${key} si no existe
  );
}

/**
 * Recursively walks any plain object / array and applies interpolateEnv
 * to every string value. Non-string primitives and null are left untouched.
 */
function interpolateDeep(node) {
  if (typeof node === "string") return interpolateEnv(node);
  if (Array.isArray(node)) return node.map(interpolateDeep);
  if (node !== null && typeof node === "object") {
    const result = {};
    for (const [key, val] of Object.entries(node)) {
      result[key] = interpolateDeep(val);
    }
    return result;
  }
  return node;
}

function normalizePipelineStep(step, index) {
  return {
    id: step.id ?? `step-${index + 1}`,
    label: step.label ?? step.command ?? `Step ${index + 1}`,
    command: step.command ?? "",
    captureAs: step.captureAs ?? null,
    cwd: step.cwd ?? null,
    continueOnError: step.continueOnError ?? false,
    showOutput: step.showOutput ?? false,
    timeoutMs: Number.isFinite(step.timeoutMs) ? step.timeoutMs : null,
  };
}

function normalizeAction(action, index, defaultTrigger = "release") {
  return {
    id: action.id ?? `action-${index + 1}`,
    command: action.command ?? "",
    label: action.label ?? action.command ?? `Action ${index + 1}`,
    cwd: action.cwd ?? ".",
    enabled: action.enabled ?? true,
    continueOnError: action.continueOnError ?? false,
    showOutput: action.showOutput ?? true,
    timeoutMs: Number.isFinite(action.timeoutMs) ? action.timeoutMs : null,
    env: action.env && typeof action.env === "object" ? action.env : {},
    envFile: typeof action.envFile === "string" ? action.envFile : null,
    promptEnv: Array.isArray(action.promptEnv) ? action.promptEnv : [],
    pipeline: Array.isArray(action.pipeline)
      ? action.pipeline.map(normalizePipelineStep)
      : [],
    on: Array.isArray(action.on)
      ? action.on
      : typeof action.on === "string"
        ? [action.on]
        : [defaultTrigger],
  };
}

export function loadVitConfig() {
  const configPath = resolve(process.cwd(), "vit-config.json");

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    // 1. Load global envFile first (lower priority than process.env)
    if (typeof parsed.envFile === "string") {
      loadEnvFile(resolve(process.cwd(), parsed.envFile));
    }

    // 2. Now interpolate ${VAR} across the entire parsed config
    const interpolated = interpolateDeep(parsed);

    let mergedTypes = DEFAULT_CONFIG.types;
    if (Array.isArray(interpolated.types) && interpolated.types.length > 0) {
      const defaultMap = new Map(DEFAULT_CONFIG.types.map((t) => [t.value, t]));

      for (const t of interpolated.types) {
        defaultMap.set(t.value, {
          value: t.value,
          label: t.label ?? defaultMap.get(t.value)?.label ?? t.value,
          choiceLabel:
            t.choiceLabel ??
            t.label ??
            defaultMap.get(t.value)?.choiceLabel ??
            t.value,
        });
      }

      const ordered = DEFAULT_CONFIG.types
        .map((t) => defaultMap.get(t.value))
        .filter(Boolean);

      const newOnes = interpolated.types.filter(
        (t) => !DEFAULT_CONFIG.types.find((d) => d.value === t.value),
      );

      mergedTypes = [
        ...ordered,
        ...newOnes.map((t) => ({
          value: t.value,
          label: t.label ?? t.value,
          choiceLabel: t.choiceLabel ?? t.label ?? t.value,
        })),
      ];
    }

    const mergedPreActions = Array.isArray(interpolated.preActions)
      ? interpolated.preActions.map((action, index) =>
          normalizeAction(action, index, "release"),
        )
      : DEFAULT_CONFIG.preActions;

    const mergedPostActions = Array.isArray(interpolated.postActions)
      ? interpolated.postActions.map((action, index) =>
          normalizeAction(action, index, "release"),
        )
      : DEFAULT_CONFIG.postActions;

    const parsedGit = interpolated.git ?? {};
    const parsedChangelog = interpolated.changelog ?? {};
    const parsedGithub = interpolated.github ?? {};

    const rawStrategy = parsedGit.rollbackStrategy;
    const rollbackStrategy =
      rawStrategy === "reset" || rawStrategy === "revert"
        ? rawStrategy
        : DEFAULT_CONFIG.git.rollbackStrategy;

    const rawPromoteStrategy = parsedGit.promoteStrategy;
    const promoteStrategy =
      rawPromoteStrategy === "pr" || rawPromoteStrategy === "merge"
        ? rawPromoteStrategy
        : DEFAULT_CONFIG.git.promoteStrategy;

    return {
      ...DEFAULT_CONFIG,
      ...interpolated,
      changelog: {
        ...DEFAULT_CONFIG.changelog,
        ...parsedChangelog,
        semantic:
          typeof parsedChangelog.semantic === "boolean"
            ? parsedChangelog.semantic
            : DEFAULT_CONFIG.changelog.semantic,
      },
      git: {
        ...DEFAULT_CONFIG.git,
        ...parsedGit,
        releaseBranches: Array.isArray(parsedGit.releaseBranches)
          ? parsedGit.releaseBranches.filter(
              (b) => typeof b === "string" && b.trim(),
            )
          : DEFAULT_CONFIG.git.releaseBranches,
        preReleaseBranches: Array.isArray(parsedGit.preReleaseBranches)
          ? parsedGit.preReleaseBranches
              .filter((b) => b?.name)
              .map((b) => ({
                name: b.name,
                id: typeof b.id === "string" ? b.id : b.name,
              }))
          : DEFAULT_CONFIG.git.preReleaseBranches,
        strict:
          typeof parsedGit.strict === "boolean"
            ? parsedGit.strict
            : DEFAULT_CONFIG.git.strict,
        rollbackStrategy,
        promoteStrategy,
      },
      github: {
        ...DEFAULT_CONFIG.github,
        token:
          typeof parsedGithub.token === "string"
            ? parsedGithub.token
            : DEFAULT_CONFIG.github.token,
        repo:
          typeof parsedGithub.repo === "string"
            ? parsedGithub.repo
            : DEFAULT_CONFIG.github.repo,
      },
      vcs: { ...DEFAULT_CONFIG.vcs, ...(interpolated.vcs ?? {}) },
      envFile:
        typeof parsed.envFile === "string"
          ? parsed.envFile
          : DEFAULT_CONFIG.envFile,
      projects:
        Array.isArray(interpolated.projects) && interpolated.projects.length > 0
          ? interpolated.projects.map((project, index) => ({
              id: project.id ?? `project${index + 1}`,
              label: project.label ?? `Project ${index + 1}`,
              path: project.path ?? ".",
              tagPrefix:
                project.tagPrefix ?? project.id ?? `project${index + 1}`,
            }))
          : DEFAULT_CONFIG.projects,
      types: mergedTypes,
      preActions: mergedPreActions,
      postActions: mergedPostActions,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function checkReleaseBranch(releaseBranches, currentBranch) {
  if (!Array.isArray(releaseBranches) || releaseBranches.length === 0) {
    return { allowed: true, matched: null };
  }

  for (const pattern of releaseBranches) {
    if (matchBranchPattern(pattern, currentBranch)) {
      return { allowed: true, matched: pattern };
    }
  }

  return { allowed: false, matched: null };
}

export function getPreReleaseBranch(preReleaseBranches, currentBranch) {
  return preReleaseBranches?.find((b) => b.name === currentBranch) ?? null;
}

function matchBranchPattern(pattern, branch) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(branch);
}
