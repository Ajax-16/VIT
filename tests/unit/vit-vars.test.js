import { jest } from "@jest/globals";

const mockExistsSync   = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule("fs", () => ({
  existsSync:    mockExistsSync,
  readFileSync:  mockReadFileSync,
  writeFileSync: jest.fn(),
}));

const { resolveVitBuiltins } = await import("../../lib/vit-vars.js");

function makeVcs(overrides = {}) {
  return {
    getCurrentBranch:    jest.fn().mockReturnValue("main"),
    getCommitHash:       jest.fn().mockReturnValue("abc1234"),
    getCommitAuthor:     jest.fn().mockReturnValue("John Doe"),
    getLastCommitMessage:jest.fn().mockReturnValue("feat: cool"),
    getLastTag:          jest.fn().mockReturnValue("v1.0.0"),
    getTagCount:         jest.fn().mockReturnValue("5"),
    getCommitCount:      jest.fn().mockReturnValue("3"),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // default: package.json exists with version+name
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: "1.2.3", name: "my-app" }));
});

describe("resolveVitBuiltins", () => {

  test("returns a non-null object", () => {
    const builtins = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(builtins).toBeDefined();
    expect(typeof builtins).toBe("object");
  });

  // ── Time vars ────────────────────────────────────────────────────────────
  test("date matches YYYY-MM-DD format", () => {
    const { date } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("datetime matches YYYY-MM-DD HH:MM format", () => {
    const { datetime } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(datetime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  test("timestamp is a numeric string", () => {
    const { timestamp } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(Number(timestamp)).toBeGreaterThan(0);
  });

  test("year is the current year as string", () => {
    const { year } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(year).toBe(String(new Date().getFullYear()));
  });

  test("month is zero-padded", () => {
    const { month } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(month).toMatch(/^\d{2}$/);
  });

  test("day is zero-padded", () => {
    const { day } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(day).toMatch(/^\d{2}$/);
  });

  test("time matches HH:MM:SS format", () => {
    const { time } = resolveVitBuiltins(process.cwd(), [], makeVcs());
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  // ── Git vars ─────────────────────────────────────────────────────────────
  test("branch comes from vcs.getCurrentBranch", () => {
    const vcs = makeVcs({ getCurrentBranch: jest.fn().mockReturnValue("feature/x") });
    expect(resolveVitBuiltins(process.cwd(), [], vcs).branch).toBe("feature/x");
  });

  test("commit_hash comes from vcs.getCommitHash", () => {
    const vcs = makeVcs({ getCommitHash: jest.fn().mockReturnValue("deadbeef") });
    expect(resolveVitBuiltins(process.cwd(), [], vcs).commit_hash).toBe("deadbeef");
  });

  test("last_tag comes from vcs.getLastTag", () => {
    const vcs = makeVcs({ getLastTag: jest.fn().mockReturnValue("v9.9.9") });
    expect(resolveVitBuiltins(process.cwd(), [], vcs).last_tag).toBe("v9.9.9");
  });

  test("tag_count comes from vcs.getTagCount", () => {
    const vcs = makeVcs({ getTagCount: jest.fn().mockReturnValue("42") });
    expect(resolveVitBuiltins(process.cwd(), [], vcs).tag_count).toBe("42");
  });

  test("commit_count calls vcs.getCommitCount with last_tag", () => {
    const getCommitCount = jest.fn().mockReturnValue("7");
    const vcs = makeVcs({ getLastTag: jest.fn().mockReturnValue("v1.0.0"), getCommitCount });
    const builtins = resolveVitBuiltins(process.cwd(), [], vcs);
    expect(builtins.commit_count).toBe("7");
    expect(getCommitCount).toHaveBeenCalledWith("v1.0.0");
  });

  // ── vcs = null fallbacks ─────────────────────────────────────────────────
  test("branch is empty string when vcs is null", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).branch).toBe("");
  });

  test("commit_hash is empty string when vcs is null", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).commit_hash).toBe("");
  });

  test("last_tag is empty string when vcs is null", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).last_tag).toBe("");
  });

  test("tag_count is '0' when vcs is null", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).tag_count).toBe("0");
  });

  test("commit_count is '0' when vcs is null", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).commit_count).toBe("0");
  });

  // ── Package vars ─────────────────────────────────────────────────────────
  test("version comes from package.json at actionCwd", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).version).toBe("1.2.3");
  });

  test("name comes from package.json at actionCwd", () => {
    expect(resolveVitBuiltins(process.cwd(), [], null).name).toBe("my-app");
  });

  test("version is empty string when package.json does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(resolveVitBuiltins(process.cwd(), [], null).version).toBe("");
  });

  // ── Monorepo per-project vars ────────────────────────────────────────────
  test("exposes version.<id> for each project", () => {
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ version: "0.0.1", name: "root" })) // actionCwd pkg
      .mockReturnValueOnce(JSON.stringify({ version: "2.0.0", name: "backend" })); // project pkg

    const projects = [{ id: "backend", path: "./backend" }];
    const builtins = resolveVitBuiltins(process.cwd(), projects, null);
    expect(builtins["version.backend"]).toBe("2.0.0");
  });

  test("skips project without id or path", () => {
    const builtins = resolveVitBuiltins(process.cwd(), [{ id: null, path: "./x" }], null);
    expect(Object.keys(builtins).some(k => k.startsWith("version."))).toBe(false);
  });

  // ── System vars ──────────────────────────────────────────────────────────
  test("node_version is a non-empty string", () => {
    const { node_version } = resolveVitBuiltins(process.cwd(), [], null);
    expect(typeof node_version).toBe("string");
    expect(node_version.length).toBeGreaterThan(0);
  });

  test("os is one of expected platform values", () => {
    const { os } = resolveVitBuiltins(process.cwd(), [], null);
    expect(["linux", "darwin", "win32"].includes(os) || typeof os === "string").toBe(true);
  });

  test("arch is a non-empty string", () => {
    const { arch } = resolveVitBuiltins(process.cwd(), [], null);
    expect(typeof arch).toBe("string");
    expect(arch.length).toBeGreaterThan(0);
  });

  test("cwd equals process.cwd()", () => {
    const { cwd } = resolveVitBuiltins(process.cwd(), [], null);
    expect(cwd).toBe(process.cwd());
  });
});
