import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const DEFAULT_CONFIG = {
  changelog: {
    path: "./CHANGELOG.md",
    title: "Changelog",
  },
  git: {
    defaultCommitMessage: "chore: update",
    releaseCommitMessage: "chore: version bump",
    changelogCommitMessage: "docs: update changelog",
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
    { value: "feat", label: "\uD83D\uDE80 Features", choiceLabel: "\uD83D\uDE80 feat     — New feature" },
    { value: "fix", label: "\uD83D\uDC1B Bug fixes", choiceLabel: "\uD83D\uDC1B fix      — Bug fix" },
    { value: "refactor", label: "\uD83D\uDE9C Refactoring", choiceLabel: "\uD83D\uDE9C refactor — Refactoring" },
    { value: "perf", label: "\u26A1 Performance", choiceLabel: "\u26A1 perf     — Performance improvement" },
    { value: "revert", label: "\u25C0\uFE0F Reverted", choiceLabel: "\u25C0\uFE0F  revert   — Revert change" },
    { value: "docs", label: "\uD83D\uDCDA Documentation", choiceLabel: "\uD83D\uDCDA docs     — Documentation" },
    { value: "style", label: "\uD83C\uDFA8 Styles", choiceLabel: "\uD83C\uDFA8 style    — Styles / UI" },
  ],
  preActions: [],
  postActions: [],
};

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

    let mergedTypes = DEFAULT_CONFIG.types;
    if (Array.isArray(parsed.types) && parsed.types.length > 0) {
      const defaultMap = new Map(DEFAULT_CONFIG.types.map((t) => [t.value, t]));

      for (const t of parsed.types) {
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

      const newOnes = parsed.types.filter(
        (t) => !DEFAULT_CONFIG.types.find((d) => d.value === t.value)
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

    const mergedPreActions = Array.isArray(parsed.preActions)
      ? parsed.preActions.map((action, index) => normalizeAction(action, index, "release"))
      : DEFAULT_CONFIG.preActions;

    const mergedPostActions = Array.isArray(parsed.postActions)
      ? parsed.postActions.map((action, index) => normalizeAction(action, index, "release"))
      : DEFAULT_CONFIG.postActions;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      changelog: { ...DEFAULT_CONFIG.changelog, ...(parsed.changelog ?? {}) },
      git: { ...DEFAULT_CONFIG.git, ...(parsed.git ?? {}) },
      vcs: { ...DEFAULT_CONFIG.vcs, ...(parsed.vcs ?? {}) },
      projects:
        Array.isArray(parsed.projects) && parsed.projects.length > 0
          ? parsed.projects.map((project, index) => ({
              id: project.id ?? `project${index + 1}`,
              label: project.label ?? `Project ${index + 1}`,
              path: project.path ?? ".",
              tagPrefix: project.tagPrefix ?? project.id ?? `project${index + 1}`,
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
