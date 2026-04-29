import { jest } from "@jest/globals";

// ── fs + child_process mocks ─────────────────────────────────────────────────
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExecSync = jest.fn();

jest.unstable_mockModule("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

jest.unstable_mockModule("child_process", () => ({
  execSync: mockExecSync,
  spawn: jest.fn(),
}));

const {
  parseAllTagsWithCommits,
  parseCommitsSinceLastTag,
  buildSemanticChangelogAuto,
  runChangelog,
} = await import("../../lib/changelog.js");

// ── default config ───────────────────────────────────────────────────────────
const BASE_CONFIG = {
  changelog: { path: "./CHANGELOG.md", title: "Changelog", semantic: true },
  types: [
    { value: "feat", label: "🚀 Features", choiceLabel: "🚀 feat" },
    { value: "fix", label: "🐛 Bug fixes", choiceLabel: "🐛 fix" },
    { value: "refactor", label: "🚜 Refactoring", choiceLabel: "🚜 refactor" },
    { value: "docs", label: "📚 Documentation", choiceLabel: "📚 docs" },
  ],
};

const MANUAL_CONFIG = {
  ...BASE_CONFIG,
  changelog: { ...BASE_CONFIG.changelog, semantic: false },
};

// ── git output helpers ────────────────────────────────────────────────────────
function gitTagsOutput(...tags) {
  return tags.join("\n");
}
function gitLogOutput(...subjects) {
  return subjects.map((s) => `"${s}"`).join("\n");
}
function gitDateOutput(date = "2024-01-15") {
  return `${date} 12:00:00 +0000`;
}

// ═════════════════════════════════════════════════════════════════════════════
describe("parseAllTagsWithCommits", () => {
  beforeEach(() => mockExecSync.mockReset());

  test("returns empty array when no tags exist", () => {
    mockExecSync.mockReturnValue("");
    expect(parseAllTagsWithCommits(BASE_CONFIG)).toEqual([]);
  });

  test("parses single tag with conventional commits", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput("2024-01-10"))
      .mockReturnValueOnce(
        gitLogOutput("feat: new login screen", "fix: null pointer"),
      );
    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].commits).toHaveLength(2);
  });

  test("ignores commits not matching conventional format", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(
        gitLogOutput("feat: good", "not conventional", "fix: also good"),
      );
    expect(parseAllTagsWithCommits(BASE_CONFIG)[0].commits).toHaveLength(2);
  });

  test("ignores commits with unknown types", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(
        gitLogOutput("feat: valid", "chore: skip this", "deploy: skip"),
      );
    expect(parseAllTagsWithCommits(BASE_CONFIG)[0].commits).toHaveLength(1);
  });

  test("parses scope correctly", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("fix(api): handle timeout"));
    const c = parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0];
    expect(c.scope).toBe("api");
    expect(c.breaking).toBe(false);
  });

  test("parses breaking change marker !", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v2.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat!: remove legacy API"));
    expect(parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0].breaking).toBe(
      true,
    );
  });

  test("pendingTag creates virtual first entry", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitLogOutput("feat: unreleased"))
      .mockReturnValueOnce(gitDateOutput("2024-01-10"))
      .mockReturnValueOnce(gitLogOutput("feat: initial"));
    const result = parseAllTagsWithCommits(BASE_CONFIG, process.cwd(), {
      pendingTag: "v1.1.0",
    });
    expect(result[0].tag).toBe("v1.1.0");
    expect(result[0].pending).toBe(true);
    expect(result[0].date).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("parseCommitsSinceLastTag", () => {
  beforeEach(() => mockExecSync.mockReset());

  test("returns empty array when no commits match known types", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitLogOutput("chore: maintenance", "wip: stuff"));
    expect(parseCommitsSinceLastTag(BASE_CONFIG)).toEqual([]);
  });

  test("returns parsed commits since last tag", () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(
        gitLogOutput("feat: new feature", "fix: bug", "chore: skip"),
      );
    const result = parseCommitsSinceLastTag(BASE_CONFIG);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("feat");
    expect(result[1].type).toBe("fix");
  });

  test("when no tags exist uses all commits from HEAD", () => {
    mockExecSync
      .mockReturnValueOnce("") // no tags
      .mockReturnValueOnce(gitLogOutput("feat: first commit"));
    const result = parseCommitsSinceLastTag(BASE_CONFIG);
    expect(result).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("buildSemanticChangelogAuto (MODE 4)", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  test("returns { saved: false } when no tags exist", async () => {
    mockExecSync.mockReturnValue("");
    const result = await buildSemanticChangelogAuto(BASE_CONFIG);
    expect(result.saved).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  test("writes file when tags exist", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat: feature", "fix: bug"));
    const result = await buildSemanticChangelogAuto(BASE_CONFIG);
    expect(result.saved).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  test("written content starts with # Changelog", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat: a"));
    await buildSemanticChangelogAuto(BASE_CONFIG);
    expect(mockWriteFileSync.mock.calls[0][1]).toMatch(/^# Changelog/);
  });

  test("includes version tag in content", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput("2024-03-15"))
      .mockReturnValueOnce(gitLogOutput("feat: something"));
    await buildSemanticChangelogAuto(BASE_CONFIG);
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain("v1.0.0");
    expect(written).toContain("15/03/2024");
  });

  test("groups commits by type", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(
        gitLogOutput("feat: thing", "fix: bug", "feat: another"),
      );
    await buildSemanticChangelogAuto(BASE_CONFIG);
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain("🚀 Features");
    expect(written).toContain("🐛 Bug fixes");
    expect(written.indexOf("🚀 Features")).toBeLessThan(
      written.indexOf("🐛 Bug fixes"),
    );
  });

  test("pendingTag appears before existing tags", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitLogOutput("feat: pending"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat: initial"));
    await buildSemanticChangelogAuto(BASE_CONFIG, { pendingTag: "v1.1.0" });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written.indexOf("v1.1.0")).toBeLessThan(written.indexOf("v1.0.0"));
  });

  test("custom changelog title is used", async () => {
    const cfg = {
      ...BASE_CONFIG,
      changelog: { ...BASE_CONFIG.changelog, title: "My Log" },
    };
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat: x"));
    await buildSemanticChangelogAuto(cfg);
    expect(mockWriteFileSync.mock.calls[0][1]).toContain("# My Log");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("runChangelog dispatch", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  test("MODE 2: non-semantic --yes → does NOT write file", async () => {
    await runChangelog(MANUAL_CONFIG, { yes: true });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  test("MODE 4: semantic --yes with tags → writes file", async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput("v1.0.0"))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput("feat: auto"));
    await runChangelog(BASE_CONFIG, { yes: true });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  test("MODE 3: semantic non-interactive without pendingTag → returns { saved: false } (no write)", async () => {
    mockExecSync.mockReturnValue(""); // no tags → buildSemanticChangelogAuto returns saved:false
    const result = await runChangelog(BASE_CONFIG, {
      yes: false,
      pendingTag: undefined,
    });
    expect(result).toMatchObject({ saved: false });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
