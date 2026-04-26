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
        { value: "feat", label: "🚀 Features", choiceLabel: "🚀 feat     — New feature" },
        { value: "fix", label: "🐛 Bug fixes", choiceLabel: "🐛 fix      — Bug fix" },
        { value: "refactor", label: "🚜 Refactoring", choiceLabel: "🚜 refactor — Refactoring" },
        { value: "perf", label: "⚡ Performance", choiceLabel: "⚡ perf     — Performance improvement" },
        { value: "revert", label: "◀️ Reverted", choiceLabel: "◀️  revert   — Revert change" },
        { value: "docs", label: "📚 Documentation", choiceLabel: "📚 docs     — Documentation" },
        { value: "style", label: "🎨 Styles", choiceLabel: "🎨 style    — Styles / UI" },
    ],
    // Commands to run after a release/commit/changelog action.
    // Each entry: { command, on?, label?, continueOnError? }
    // on: ["release"] by default. Accepts "release" | "commit" | "changelog"
    postActions: [],
};

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
                    choiceLabel: t.choiceLabel ?? t.label ?? defaultMap.get(t.value)?.choiceLabel ?? t.value,
                });
            }
            const ordered = DEFAULT_CONFIG.types.map((t) => defaultMap.get(t.value)).filter(Boolean);
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

        // Normalize postActions: ensure every entry has a valid "on" array
        const mergedPostActions = Array.isArray(parsed.postActions)
            ? parsed.postActions.map((action) => ({
                command: action.command,
                label: action.label ?? action.command,
                continueOnError: action.continueOnError ?? false,
                on: Array.isArray(action.on)
                    ? action.on
                    : typeof action.on === "string"
                        ? [action.on]
                        : ["release"],
            }))
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
                        path: project.path,
                        tagPrefix: project.tagPrefix ?? project.id ?? `project${index + 1}`,
                    }))
                    : DEFAULT_CONFIG.projects,
            types: mergedTypes,
            postActions: mergedPostActions,
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}