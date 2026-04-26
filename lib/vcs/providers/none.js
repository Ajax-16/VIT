export const noneAdapter = {
    supportsVersioning() {
        return false;
    },

    supportsCommit() {
        return false;
    },

    supportsPush() {
        return false;
    },

    getCurrentBranch() {
        return null;
    },

    getLastTag() {
        return null;
    },

    getAllTags() {
        return [];
    },

    getTagsAfter() {
        return [];
    },

    deleteTag() { },

    rollbackToTag() {
        throw new Error("Rollback not supported with 'none' VCS provider.");
    },

    addAll() { },

    commit() { },

    tag() { },

    pushWithTags() { },
};