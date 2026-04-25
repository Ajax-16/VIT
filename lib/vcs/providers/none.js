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
        throw new Error("Rollback no disponible sin sistema de control de versiones");
    },

    addAll() { },

    commit() { },

    tag() { },

    pushWithTags() { },
};