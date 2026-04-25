import { execSync } from "child_process";

function exec(cmd, opts = {}) {
    return execSync(cmd, {
        encoding: "utf-8",
        stdio: opts.silent ? "pipe" : "inherit",
        ...opts,
    });
}

export const gitAdapter = {
    supportsVersioning() {
        return true;
    },

    supportsCommit() {
        return true;
    },

    supportsPush() {
        return true;
    },

    getCurrentBranch() {
        try {
            return exec("git rev-parse --abbrev-ref HEAD", { silent: true }).trim();
        } catch {
            return null;
        }
    },

    getLastTag() {
        try {
            return exec("git describe --tags --abbrev=0", { silent: true }).trim();
        } catch {
            return null;
        }
    },

    getAllTags() {
        try {
            const output = exec("git tag --sort=-creatordate", { silent: true });
            return [
                ...new Set(
                    output
                        .split(/\r?\n/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                ),
            ];
        } catch {
            return [];
        }
    },

    getTagsAfter(tag) {
        try {
            const output = exec("git tag --sort=-creatordate", { silent: true });
            const allTags = [
                ...new Set(
                    output
                        .split(/\r?\n/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                ),
            ];

            const tagsAfter = [];
            for (const t of allTags) {
                if (t === tag) break;
                tagsAfter.push(t);
            }

            return tagsAfter;
        } catch {
            return [];
        }
    },

    deleteTag(tag) {
        try {
            exec(`git tag -d "${tag}"`, { silent: true });
        } catch { }

        try {
            exec(`git push origin --delete "${tag}"`);
        } catch { }
    },

    rollbackToTag(tag) {
        exec(`git reset --mixed "${tag}"`);
    },

    addAll() {
        exec("git add -A");
    },

    commit(message) {
        exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    },

    tag(tag, message) {
        exec(`git tag -a "${tag}" -m "${message.replace(/"/g, '\\"')}"`);
    },

    pushWithTags() {
        exec("git push --follow-tags");
    },
};