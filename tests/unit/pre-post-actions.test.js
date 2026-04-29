import { jest } from "@jest/globals";

// ── mock actions.js ───────────────────────────────────────────────────────────
const mockRunActions   = jest.fn().mockResolvedValue(undefined);
const mockPrintSummary = jest.fn();

jest.unstable_mockModule("../../lib/actions.js", () => ({
  runActions:          mockRunActions,
  printActionsSummary: mockPrintSummary,
}));

const { runPreActions,  printPreActionsSummary  } = await import("../../lib/pre-actions.js");
const { runPostActions, printPostActionsSummary } = await import("../../lib/post-actions.js");

function makeConfig(overrides = {}) {
  return {
    preActions:  [],
    postActions: [],
    envFile:     null,
    projects:    [],
    vcs:         { provider: "git" },
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
describe("printPreActionsSummary", () => {
  test("calls printActionsSummary with preActions and 'pre-actions' label", () => {
    const config = makeConfig({ preActions: [{ command: "echo" }] });
    printPreActionsSummary(config, "release");
    expect(mockPrintSummary).toHaveBeenCalledWith(
      config.preActions,
      "release",
      "pre-actions"
    );
  });

  test("falls back to [] when preActions is missing", () => {
    printPreActionsSummary({ vcs: { provider: "git" } }, "release");
    expect(mockPrintSummary).toHaveBeenCalledWith([], "release", "pre-actions");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("runPreActions", () => {
  test("calls runActions with correct arguments", async () => {
    const config = makeConfig({
      preActions: [{ command: "echo pre" }],
      envFile:    ".env",
      projects:   [{ id: "core", path: "." }],
    });
    await runPreActions(config, "release");
    expect(mockRunActions).toHaveBeenCalledWith(
      config.preActions,
      "release",
      "pre-actions",
      ".env",
      config.projects,
      "git"
    );
  });

  test("falls back to [] when preActions is missing", async () => {
    await runPreActions({ vcs: { provider: "git" } }, "commit");
    expect(mockRunActions).toHaveBeenCalledWith(
      [],
      "commit",
      "pre-actions",
      null,
      [],
      "git"
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("printPostActionsSummary", () => {
  test("calls printActionsSummary with postActions and 'post-actions' label", () => {
    const config = makeConfig({ postActions: [{ command: "deploy" }] });
    printPostActionsSummary(config, "release");
    expect(mockPrintSummary).toHaveBeenCalledWith(
      config.postActions,
      "release",
      "post-actions"
    );
  });

  test("falls back to [] when postActions is missing", () => {
    printPostActionsSummary({ vcs: { provider: "git" } }, "release");
    expect(mockPrintSummary).toHaveBeenCalledWith([], "release", "post-actions");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("runPostActions", () => {
  test("calls runActions with correct arguments", async () => {
    const config = makeConfig({
      postActions: [{ command: "echo post" }],
      envFile:     ".env",
      projects:    [{ id: "core", path: "." }],
    });
    await runPostActions(config, "release");
    expect(mockRunActions).toHaveBeenCalledWith(
      config.postActions,
      "release",
      "post-actions",
      ".env",
      config.projects,
      "git"
    );
  });

  test("falls back to [] when postActions is missing", async () => {
    await runPostActions({ vcs: { provider: "git" } }, "commit");
    expect(mockRunActions).toHaveBeenCalledWith(
      [],
      "commit",
      "post-actions",
      null,
      [],
      "git"
    );
  });
});
