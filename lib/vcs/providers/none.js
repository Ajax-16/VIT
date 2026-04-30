export const noneAdapter = {
  supportsVersioning() { return false; },
  supportsCommit()    { return false; },
  supportsPush()      { return false; },

  // ── Read / inspect ────────────────────────────────────────────────────────
  getCurrentBranch()             { return null; },
  getLastTag()                   { return null; },
  getCommitHash()                { return null; },
  getCommitAuthor()              { return null; },
  getLastCommitMessage()         { return null; },
  getTagCount()                  { return "0"; },
  getCommitCount()               { return "0"; },
  getAllTags()                    { return []; },
  getTagsAfter()                 { return []; },
  getCommitsBetweenTagAndHead()  { return []; },
  getSha()                       { return null; },
  isDirty()                      { return false; },
  commitsBehind()                { return 0; },
  getRemoteUrl()                 { return null; },

  // ── Remote sync ───────────────────────────────────────────────────────────
  fetchAll()      { },
  pullFfOnly()    { },
  push()          { },
  pushForce()     { },

  // ── Merge ─────────────────────────────────────────────────────────────────
  merge()         { },
  mergeAbort()    { },

  // ── History rewrite / rollback ────────────────────────────────────────────
  revertToTag()   { throw new Error("Rollback not supported with 'none' VCS provider."); },
  resetHard()     { throw new Error("resetHard not supported with 'none' VCS provider."); },
  rollbackToTag() { throw new Error("Rollback not supported with 'none' VCS provider."); },
  deleteTag()     { },

  // ── Working tree ─────────────────────────────────────────────────────────
  checkout()      { },
  addAll()        { },
  commit()        { },
  tag()           { },
  pushWithTags()  { },
};
