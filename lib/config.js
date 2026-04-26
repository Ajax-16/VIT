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
    postActions: [],
};

function normalizePostAction(action, index) {
    return {
        id: action.id ?? `post-action-${index + 1}`,
        command: action.command ?? "",
        label: action.label ?? action.command ?? `Post action ${index + 1}`,
        cwd: action.cwd ?? ".",
        enabled: action.enabled ?? true,
        continueOnError: action.continueOnError ?? false,
        showOutput: action.showOutput ?? true,
        timeoutMs: Number.isFinite(action.timeoutMs) ? action.timeoutMs : null,
        env: action.env && typeof action.env === "object" ? action.env : {},
        promptEnv: Array.isArray(action.promptEnv) ? action.promptEnv : [],
        on: Array.isArray(action.on)
            ? action.on
            : typeof action.on === "string"
                ? [action.on]
                : ["release"],
    };
}

export function loadVitConfig() {
    const configPath = resolve(process.cwd(), "vit-config.json");

    console.log("[debug][config] process.cwd():", process.cwd());
    console.log("[debug][config] config path:", configPath);
    console.log("[debug][config] exists:", existsSync(configPath));

    if (!existsSync(configPath)) {
        console.log("[debug][config] vit-config.json not found, using default config");
        return DEFAULT_CONFIG;
    }

    try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);

        console.log("[debug][config] raw parsed config:");
        console.log(JSON.stringify(parsed, null, 2));

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

        const mergedPostActions = Array.isArray(parsed.postActions)
            ? parsed.postActions.map((action, index) => normalizePostAction(action, index))
            : DEFAULT_CONFIG.postActions;

        const finalConfig = {
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
            postActions: mergedPostActions,
        };

        console.log("[debug][config] normalized postActions:");
        console.log(JSON.stringify(finalConfig.postActions, null, 2));

        return finalConfig;
    } catch (error) {
        console.log("[debug][config] failed to parse vit-config.json, using default config");
        console.log("[debug][config] error:", error?.message ?? error);
        return DEFAULT_CONFIG;
    }
}