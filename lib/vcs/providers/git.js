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

  // ── Read / inspect ────────────────────────────────────────────────────────

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

  getCommitHash() {
    try {
      return exec("git rev-parse --short HEAD", { silent: true }).trim();
    } catch {
      return null;
    }
  },

  getCommitAuthor() {
    try {
      return exec("git log -1 --format=%an", { silent: true }).trim();
    } catch {
      return null;
    }
  },

  getLastCommitMessage() {
    try {
      return exec("git log -1 --format=%s", { silent: true }).trim();
    } catch {
      return null;
    }
  },

  getTagCount() {
    try {
      return String(this.getAllTags().length);
    } catch {
      return "0";
    }
  },

  getCommitCount(lastTag) {
    try {
      const range = lastTag ? `"${lastTag}"..HEAD` : "HEAD";
      return exec(`git rev-list ${range} --count`, { silent: true }).trim();
    } catch {
      return "0";
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

  getTagDate(tag) {
    try {
      return exec(`git log -1 --format=%ai "${tag}"`, { silent: true })
        .trim()
        .split(" ")[0];
    } catch {
      return null;
    }
  },

  getCommitsBetween(from, to) {
    const range = from ? `"${from}".."${to}"` : `"${to}"`;
    try {
      const output = exec(`git log ${range} --pretty=format:"%s"`, { silent: true });
      return output
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  },

  getCommitsToHead(from) {
    const range = from ? `"${from}"..HEAD` : "HEAD";
    try {
      const output = exec(`git log ${range} --pretty=format:"%s"`, { silent: true });
      return output
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  },

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

  /** Returns the full SHA of the given ref (branch, tag, HEAD, origin/branch…). */
  getSha(ref) {
    return exec(`git rev-parse ${ref}`, { silent: true }).trim();
  },

  /** Returns true if the working tree has uncommitted changes. */
  isDirty() {
    try {
      return exec("git status --porcelain", { silent: true }).trim().length > 0;
    } catch {
      return false;
    }
  },

  /**
   * Returns how many commits `branch` is behind `base`.
   * Prefers origin/<branch> when available so no checkout is needed.
   */
  commitsBehind(branch, base) {
    try {
      const branchRef = (() => {
        try { this.getSha(`origin/${branch}`); return `origin/${branch}`; }
        catch { return branch; }
      })();
      const count = exec(`git rev-list --count ${branchRef}..${base}`, { silent: true }).trim();
      return parseInt(count, 10);
    } catch {
      return 0;
    }
  },

  /** Returns the URL of the `origin` remote, or null. */
  getRemoteUrl() {
    try {
      return exec("git remote get-url origin", { silent: true }).trim();
    } catch {
      return null;
    }
  },

  // ── Remote sync ───────────────────────────────────────────────────────────

  /**
   * Single fetch that updates all remote refs, tags, and prunes dead refs.
   * Non-fatal: silently continues if offline or no remote.
   */
  fetchAll() {
    try {
      exec("git fetch --tags --prune origin", { silent: true });
    } catch { /* non-fatal — offline or no remote */ }
  },

  /**
   * Fast-forward pull of `branch` from origin.
   * Non-fatal: silently continues if offline, no remote, or already up to date.
   */
  pullFfOnly(branch) {
    try {
      exec(`git pull --ff-only origin ${branch}`, { silent: true });
    } catch { /* non-fatal */ }
  },

  /**
   * Pushes `branch` to origin (normal, no force).
   * Throws on failure so callers can handle it.
   */
  push(branch) {
    exec(`git push origin ${branch}`);
  },

  /**
   * Force-pushes `branch` to origin using --force-with-lease
   * (safe force: fails if remote has new commits we haven't seen).
   */
  pushForce(branch) {
    exec(`git push --force-with-lease origin ${branch}`);
  },

  // ── Merge ────────────────────────────────────────────────────────────────

  /**
   * Merges `sourceBranch` into the current branch.
   *
   * Options:
   *   ffOnly  — `--ff-only`  (fails if not fast-forwardable)
   *   noFf    — `--no-ff`    (always creates a merge commit)
   *   message — custom merge commit message
   *
   * Defaults to a standard merge (Git decides ff vs merge commit).
   * Throws on conflict or failure.
   */
  merge(sourceBranch, { ffOnly = false, noFf = false, message = null } = {}) {
    const flag = ffOnly ? "--ff-only" : noFf ? "--no-ff" : "";
    const msg  = message ? `-m "${message.replace(/"/g, '\\"')}"` : "";
    exec(`git merge "${sourceBranch}" ${flag} ${msg}`.trim());
  },

  /** Aborts an in-progress merge. Non-fatal if no merge is in progress. */
  mergeAbort() {
    try {
      exec("git merge --abort", { silent: true });
    } catch { /* no merge in progress */ }
  },

  // ── History rewrite / rollback ────────────────────────────────────────────

  /**
   * Reverts all commits between `tag` and HEAD by creating a new revert commit.
   */
  revertToTag(tag) {
    const shas = exec(`git log --pretty=format:"%H" "${tag}"..HEAD`, {
      silent: true,
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (shas.length === 0) {
      throw new Error(`No commits found between ${tag} and HEAD.`);
    }

    for (const sha of shas) {
      exec(`git revert --no-commit "${sha}"`);
    }

    const message = `revert: rollback to ${tag}`;
    exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  },

  /**
   * Hard-resets HEAD to `ref` (tag, SHA, branch…). Rewrites history.
   */
  resetHard(ref) {
    exec(`git reset --hard "${ref}"`);
  },

  /**
   * Hard-resets HEAD to `tag`. Alias of resetHard kept for compatibility.
   */
  rollbackToTag(tag) {
    this.resetHard(tag);
  },

  deleteTag(tag) {
    try {
      exec(`git tag -d "${tag}"`, { silent: true });
    } catch {}

    try {
      exec(`git push origin --delete "${tag}"`);
    } catch {}
  },

  // ── Working tree ─────────────────────────────────────────────────────────

  checkout(branchName) {
    exec(`git checkout "${branchName}"`);
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
