import { jest } from "@jest/globals";

// ── mocks ─────────────────────────────────────────────────────────────────────
const mockSpawn    = jest.fn();
const mockExistsSync   = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  spawn:    mockSpawn,
  execSync: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync:    mockExistsSync,
  readFileSync:  mockReadFileSync,
  writeFileSync: jest.fn(),
}));

jest.unstable_mockModule("../../lib/pipeline.js", () => ({
  runSteps:          jest.fn().mockResolvedValue({}),
  printStepsSummary: jest.fn(),
}));

jest.unstable_mockModule("../../lib/vit-vars.js", () => ({
  resolveVitBuiltins: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule("../../lib/vcs/index.js", () => ({
  getVcsAdapter: jest.fn().mockReturnValue({}),
}));

const {
  interpolateEnvValue,
  interpolateCommand,
  loadEnvFile,
  normalizeAction,
  isValidTrigger,
  getApplicableActions,
  validateActions,
  VALID_TRIGGERS,
} = await import("../../lib/actions.js");

// ══════════════════════════════════════════════════════════════════════════════
describe("interpolateEnvValue", () => {
  test("replaces ${VAR} with env value", () => {
    expect(interpolateEnvValue("hello ${NAME}", { NAME: "world" })).toBe("hello world");
  });

  test("leaves placeholder intact when key is missing", () => {
    expect(interpolateEnvValue("v${MISSING}", {})).toBe("v");
  });

  test("returns non-string values unchanged", () => {
    expect(interpolateEnvValue(42, {})).toBe(42);
    expect(interpolateEnvValue(null, {})).toBeNull();
  });

  test("replaces multiple placeholders", () => {
    expect(interpolateEnvValue("${A}-${B}", { A: "foo", B: "bar" })).toBe("foo-bar");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("interpolateCommand", () => {
  test("replaces placeholder in command string", () => {
    expect(interpolateCommand("echo ${MSG}", { MSG: "hi" })).toBe("echo hi");
  });

  test("returns non-string unchanged", () => {
    expect(interpolateCommand(null, {})).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadEnvFile", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns empty object when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadEnvFile(".env")).toEqual({});
  });

  test("parses KEY=VALUE pairs", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("FOO=bar\nBAZ=qux");
    expect(loadEnvFile(".env")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("ignores comment lines", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("# comment\nKEY=val");
    expect(loadEnvFile(".env")).toEqual({ KEY: "val" });
  });

  test("strips surrounding quotes from values", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('QUOTED="hello world"');
    expect(loadEnvFile(".env")).toEqual({ QUOTED: "hello world" });
  });

  test("ignores lines without = sign", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("NOEQUALSSIGN\nGOOD=ok");
    expect(loadEnvFile(".env")).toEqual({ GOOD: "ok" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("normalizeAction", () => {
  test("auto-assigns id when missing", () => {
    const a = normalizeAction({ command: "echo hi" }, 0);
    expect(a.id).toBe("action-1");
  });

  test("uses provided id", () => {
    const a = normalizeAction({ id: "my-action", command: "x" }, 0);
    expect(a.id).toBe("my-action");
  });

  test("defaults on to [defaultTrigger]", () => {
    const a = normalizeAction({ command: "x" }, 0, "commit");
    expect(a.on).toEqual(["commit"]);
  });

  test("wraps string on into array", () => {
    const a = normalizeAction({ command: "x", on: "changelog" }, 0);
    expect(a.on).toEqual(["changelog"]);
  });

  test("keeps array on unchanged", () => {
    const a = normalizeAction({ command: "x", on: ["release", "commit"] }, 0);
    expect(a.on).toEqual(["release", "commit"]);
  });

  test("defaults enabled to true", () => {
    expect(normalizeAction({ command: "x" }, 0).enabled).toBe(true);
  });

  test("defaults continueOnError to false", () => {
    expect(normalizeAction({ command: "x" }, 0).continueOnError).toBe(false);
  });

  test("defaults pipeline to []", () => {
    expect(normalizeAction({ command: "x" }, 0).pipeline).toEqual([]);
  });

  test("defaults promptEnv to []", () => {
    expect(normalizeAction({ command: "x" }, 0).promptEnv).toEqual([]);
  });

  test("timeoutMs is null when not finite", () => {
    expect(normalizeAction({ command: "x", timeoutMs: "bad" }, 0).timeoutMs).toBeNull();
  });

  test("timeoutMs is kept when finite", () => {
    expect(normalizeAction({ command: "x", timeoutMs: 3000 }, 0).timeoutMs).toBe(3000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("isValidTrigger", () => {
  test.each(VALID_TRIGGERS)("'%s' is valid", (t) => {
    expect(isValidTrigger(t)).toBe(true);
  });

  test("'prerelease' is a valid trigger", () => {
    expect(isValidTrigger("prerelease")).toBe(true);
  });

  test("unknown trigger returns false", () => {
    expect(isValidTrigger("deploy")).toBe(false);
    expect(isValidTrigger("")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("getApplicableActions", () => {
  const base = { command: "echo hi", enabled: true, on: ["release"] };

  test("returns [] when actions is not an array", () => {
    expect(getApplicableActions(null, "release")).toEqual([]);
  });

  test("returns [] when no action matches trigger", () => {
    expect(getApplicableActions([base], "commit")).toEqual([]);
  });

  test("returns matching actions for 'release'", () => {
    const result = getApplicableActions([base], "release");
    expect(result).toHaveLength(1);
  });

  test("action with on=['prerelease'] fires on prerelease trigger", () => {
    const preAction = { command: "echo pre", enabled: true, on: ["prerelease"] };
    expect(getApplicableActions([preAction], "prerelease")).toHaveLength(1);
  });

  test("action with on=['prerelease'] does NOT fire on release trigger", () => {
    const preAction = { command: "echo pre", enabled: true, on: ["prerelease"] };
    expect(getApplicableActions([preAction], "release")).toHaveLength(0);
  });

  test("action with on=['release'] does NOT fire on prerelease trigger", () => {
    expect(getApplicableActions([base], "prerelease")).toHaveLength(0);
  });

  test("action with on=['release','prerelease'] fires on both triggers", () => {
    const both = { command: "echo both", enabled: true, on: ["release", "prerelease"] };
    expect(getApplicableActions([both], "release")).toHaveLength(1);
    expect(getApplicableActions([both], "prerelease")).toHaveLength(1);
  });

  test("filters out disabled actions", () => {
    const disabled = { ...base, enabled: false };
    expect(getApplicableActions([disabled], "release")).toEqual([]);
  });

  test("filters out actions with empty command", () => {
    const noCmd = { ...base, command: "" };
    expect(getApplicableActions([noCmd], "release")).toEqual([]);
  });

  test("filters out actions with whitespace-only command", () => {
    const wsCmd = { ...base, command: "   " };
    expect(getApplicableActions([wsCmd], "release")).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("validateActions", () => {
  test("does not throw for valid triggers", () => {
    const actions = [normalizeAction({ command: "x", on: ["release"] }, 0)];
    expect(() => validateActions(actions)).not.toThrow();
  });

  test("does not throw for 'prerelease' trigger", () => {
    const actions = [normalizeAction({ command: "x", on: ["prerelease"] }, 0)];
    expect(() => validateActions(actions)).not.toThrow();
  });

  test("does not throw for combined release + prerelease", () => {
    const actions = [normalizeAction({ command: "x", on: ["release", "prerelease"] }, 0)];
    expect(() => validateActions(actions)).not.toThrow();
  });

  test("throws for invalid trigger", () => {
    const actions = [normalizeAction({ command: "x", on: ["deploy"] }, 0)];
    expect(() => validateActions(actions)).toThrow(/Invalid trigger/);
  });

  test("throws mentioning the bad trigger value", () => {
    const actions = [normalizeAction({ command: "x", on: ["deploy"] }, 0)];
    expect(() => validateActions(actions)).toThrow("deploy");
  });
});
