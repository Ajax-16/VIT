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

    /**
     * Returns the list of commit subjects between `tag` and HEAD (exclusive).
     * Used to show the user a preview of what will be reverted/reset before
     * executing the rollback.
     *
     * @param {string} tag
     * @returns {string[]}
     */
    getCommitsBetweenTagAndHead(tag) {
        try {
            const output = exec(
                `git log --oneline --pretty=format:"%s" "${tag}"..HEAD`,
                { silent: true },
            );
            return output
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
        } catch {
            return [];
        }
    },

    /**
     * Reverts all commits between `tag` and HEAD by creating a new revert
     * commit. History is preserved — no force push needed.
     *
     * Strategy: use `git revert --no-commit` on each commit in reverse order
     * (newest first), then create a single revert commit summarising the range.
     *
     * @param {string} tag
     */
    revertToTag(tag) {
        // Collect the SHAs from HEAD back to (but not including) the tag commit.
        const shas = exec(
            `git log --pretty=format:"%H" "${tag}"..HEAD`,
            { silent: true },
        )
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);

        if (shas.length === 0) {
            throw new Error(`No commits found between ${tag} and HEAD.`);
        }

        // Stage the revert of every commit without auto-committing.
        for (const sha of shas) {
            exec(`git revert --no-commit "${sha}"`);
        }

        // Single descriptive commit.
        const message = `revert: rollback to ${tag}`;
        exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
    },

    /**
     * Hard-resets HEAD to `tag`. Rewrites history — requires force push.
     * Use only on personal/solo repos.
     *
     * @param {string} tag
     */
    rollbackToTag(tag) {
        exec(`git reset --hard "${tag}"`);
    },

    deleteTag(tag) {
        try {
            exec(`git tag -d "${tag}"`, { silent: true });
        } catch { }

        try {
            exec(`git push origin --delete "${tag}"`);
        } catch { }
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
