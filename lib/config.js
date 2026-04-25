import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const DEFAULT_CONFIG = {
    changelog: {
        path: "./CHANGELOG.md",
        title: "Registro de cambios",
    },
    git: {
        defaultCommitMessage: "chore: update",
        releaseCommitMessage: "chore: version bump",
        changelogCommitMessage: "docs: update changelog",
    },
    vcs: {
        provider: "git"
    },
    projects: [
        {
            id: "core",
            label: "Core",
            path: ".",
            tagPrefix: "core"
        }
    ]
};

export function loadVitConfig() {
    const configPath = resolve(process.cwd(), "vit-config.json");

    if (!existsSync(configPath)) {
        return DEFAULT_CONFIG;
    }

    try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);

        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            changelog: {
                ...DEFAULT_CONFIG.changelog,
                ...(parsed.changelog ?? {}),
            },
            git: {
                ...DEFAULT_CONFIG.git,
                ...(parsed.git ?? {}),
            },
            vcs: {
                ...DEFAULT_CONFIG.vcs,
                ...(parsed.vcs ?? {}),
            },
            projects:
                Array.isArray(parsed.projects) && parsed.projects.length > 0
                    ? parsed.projects.map((project, index) => ({
                        id: project.id ?? `project${index + 1}`,
                        label: project.label ?? `Proyecto ${index + 1}`,
                        path: project.path,
                        tagPrefix:
                            project.tagPrefix ??
                            project.id ??
                            `project${index + 1}`,
                    }))
                    : DEFAULT_CONFIG.projects,
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}