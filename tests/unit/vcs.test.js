import { jest } from "@jest/globals";

// ── mock child_process before importing vcs modules ───────────────────────────
const mockExecSync = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  execSync: mockExecSync,
  spawn:    jest.fn(),
}));

const { getVcsAdapter, vcsLabel } = await import("../../lib/vcs/index.js");
const { gitAdapter }              = await import("../../lib/vcs/providers/git.js");
const { noneAdapter }             = await import("../../lib/vcs/providers/none.js");

// ══════════════════════════════════════════════════════════════════════════════
describe("getVcsAdapter", () => {
  test('returns gitAdapter for provider "git"', () => {
    expect(getVcsAdapter("git")).toBe(gitAdapter);
  });

  test('returns gitAdapter as default (undefined provider)', () => {
    expect(getVcsAdapter()).toBe(gitAdapter);
  });

  test('returns gitAdapter for unknown provider (default branch)', () => {
    expect(getVcsAdapter("unknown")).toBe(gitAdapter);
  });

  test('returns noneAdapter for provider "none"', () => {
    expect(getVcsAdapter("none")).toBe(noneAdapter);
  });

  test('is case-insensitive ("GIT")', () => {
    expect(getVcsAdapter("GIT")).toBe(gitAdapter);
  });

  test('is case-insensitive ("NONE")', () => {
    expect(getVcsAdapter("NONE")).toBe(noneAdapter);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("vcsLabel", () => {
  test('returns "Git" for git', () => {
    expect(vcsLabel("git")).toBe("Git");
  });

  test('returns "Sin VCS" for none', () => {
    expect(vcsLabel("none")).toBe("Sin VCS");
  });

  test('returns the raw provider string for unknown values', () => {
    expect(vcsLabel("svn")).toBe("svn");
  });

  test('defaults to "Git" when no argument given', () => {
    expect(vcsLabel()).toBe("Git");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("noneAdapter", () => {
  test("supportsVersioning returns false", () => {
    expect(noneAdapter.supportsVersioning()).toBe(false);
  });

  test("supportsCommit returns false", () => {
    expect(noneAdapter.supportsCommit()).toBe(false);
  });

  test("supportsPush returns false", () => {
    expect(noneAdapter.supportsPush()).toBe(false);
  });

  test("getCurrentBranch returns null", () => {
    expect(noneAdapter.getCurrentBranch()).toBeNull();
  });

  test("getLastTag returns null", () => {
    expect(noneAdapter.getLastTag()).toBeNull();
  });

  test("getAllTags returns empty array", () => {
    expect(noneAdapter.getAllTags()).toEqual([]);
  });

  test("getTagsAfter returns empty array", () => {
    expect(noneAdapter.getTagsAfter("v1.0.0")).toEqual([]);
  });

  test("deleteTag does nothing (no throw)", () => {
    expect(() => noneAdapter.deleteTag("v1.0.0")).not.toThrow();
  });

  test("rollbackToTag throws", () => {
    expect(() => noneAdapter.rollbackToTag("v1.0.0")).toThrow();
  });

  test("addAll does nothing (no throw)", () => {
    expect(() => noneAdapter.addAll()).not.toThrow();
  });

  test("commit does nothing (no throw)", () => {
    expect(() => noneAdapter.commit("msg")).not.toThrow();
  });

  test("tag does nothing (no throw)", () => {
    expect(() => noneAdapter.tag("v1", "msg")).not.toThrow();
  });

  test("pushWithTags does nothing (no throw)", () => {
    expect(() => noneAdapter.pushWithTags()).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("gitAdapter (mocked execSync)", () => {
  afterEach(() => jest.clearAllMocks());

  test("supportsVersioning returns true", () => {
    expect(gitAdapter.supportsVersioning()).toBe(true);
  });

  test("supportsCommit returns true", () => {
    expect(gitAdapter.supportsCommit()).toBe(true);
  });

  test("supportsPush returns true", () => {
    expect(gitAdapter.supportsPush()).toBe(true);
  });

  test("getCurrentBranch returns trimmed output", () => {
    mockExecSync.mockReturnValue("main\n");
    expect(gitAdapter.getCurrentBranch()).toBe("main");
  });

  test("getCurrentBranch returns null on error", () => {
    mockExecSync.mockImplementation(() => { throw new Error("fail"); });
    expect(gitAdapter.getCurrentBranch()).toBeNull();
  });

  test("getLastTag returns trimmed tag", () => {
    mockExecSync.mockReturnValue("v1.2.3\n");
    expect(gitAdapter.getLastTag()).toBe("v1.2.3");
  });

  test("getLastTag returns null on error", () => {
    mockExecSync.mockImplementation(() => { throw new Error(); });
    expect(gitAdapter.getLastTag()).toBeNull();
  });

  test("getCommitHash returns short hash", () => {
    mockExecSync.mockReturnValue("abc1234\n");
    expect(gitAdapter.getCommitHash()).toBe("abc1234");
  });

  test("getCommitHash returns null on error", () => {
    mockExecSync.mockImplementation(() => { throw new Error(); });
    expect(gitAdapter.getCommitHash()).toBeNull();
  });

  test("getCommitAuthor returns author name", () => {
    mockExecSync.mockReturnValue("John Doe\n");
    expect(gitAdapter.getCommitAuthor()).toBe("John Doe");
  });

  test("getLastCommitMessage returns message", () => {
    mockExecSync.mockReturnValue("feat: add thing\n");
    expect(gitAdapter.getLastCommitMessage()).toBe("feat: add thing");
  });

  test("getAllTags parses newline-separated list", () => {
    mockExecSync.mockReturnValue("v2.0.0\nv1.0.0\n");
    expect(gitAdapter.getAllTags()).toEqual(["v2.0.0", "v1.0.0"]);
  });

  test("getAllTags returns [] on error", () => {
    mockExecSync.mockImplementation(() => { throw new Error(); });
    expect(gitAdapter.getAllTags()).toEqual([]);
  });

  test("getTagsAfter returns tags newer than given tag", () => {
    mockExecSync.mockReturnValue("v3.0.0\nv2.0.0\nv1.0.0\n");
    expect(gitAdapter.getTagsAfter("v2.0.0")).toEqual(["v3.0.0"]);
  });

  test("getTagsAfter returns [] on error", () => {
    mockExecSync.mockImplementation(() => { throw new Error(); });
    expect(gitAdapter.getTagsAfter("v1.0.0")).toEqual([]);
  });

  test("getTagCount returns string count of tags", () => {
    mockExecSync.mockReturnValue("v1.0.0\nv2.0.0\n");
    expect(gitAdapter.getTagCount()).toBe("2");
  });

  test("getCommitCount uses range when lastTag provided", () => {
    mockExecSync.mockReturnValue("5\n");
    expect(gitAdapter.getCommitCount("v1.0.0")).toBe("5");
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("v1.0.0"),
      expect.anything()
    );
  });

  test("getCommitCount uses HEAD when no lastTag", () => {
    mockExecSync.mockReturnValue("3\n");
    expect(gitAdapter.getCommitCount(null)).toBe("3");
  });
});
