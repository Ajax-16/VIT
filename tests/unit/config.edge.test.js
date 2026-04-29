import { jest } from "@jest/globals";

const mockExistsSync   = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule("fs", () => ({
  existsSync:    mockExistsSync,
  readFileSync:  mockReadFileSync,
  writeFileSync: jest.fn(),
}));

const {
  loadVitConfig,
  checkReleaseBranch,
  getPreReleaseBranch,
} = await import("../../lib/config.js");

beforeEach(() => jest.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — no config file", () => {
  test("returns DEFAULT_CONFIG when vit-config.json does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const config = loadVitConfig();
    expect(config.projects[0].id).toBe("core");
    expect(config.git.strict).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — broken JSON", () => {
  test("returns DEFAULT_CONFIG when JSON is invalid", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{ bad json }");
    const config = loadVitConfig();
    expect(config.projects[0].id).toBe("core");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — rollbackStrategy validation", () => {
  function loadWith(gitOverride) {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ git: gitOverride }));
    return loadVitConfig();
  }

  test("accepts 'reset'", () => {
    expect(loadWith({ rollbackStrategy: "reset" }).git.rollbackStrategy).toBe("reset");
  });

  test("accepts 'revert'", () => {
    expect(loadWith({ rollbackStrategy: "revert" }).git.rollbackStrategy).toBe("revert");
  });

  test("falls back to default for unknown strategy", () => {
    expect(loadWith({ rollbackStrategy: "squash" }).git.rollbackStrategy).toBe("revert");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — promoteStrategy validation", () => {
  function loadWith(gitOverride) {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ git: gitOverride }));
    return loadVitConfig();
  }

  test("accepts 'pr'", () => {
    expect(loadWith({ promoteStrategy: "pr" }).git.promoteStrategy).toBe("pr");
  });

  test("accepts 'merge'", () => {
    expect(loadWith({ promoteStrategy: "merge" }).git.promoteStrategy).toBe("merge");
  });

  test("falls back to default for unknown promoteStrategy", () => {
    expect(loadWith({ promoteStrategy: "rebase" }).git.promoteStrategy).toBe("merge");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — types merging", () => {
  test("new types are appended after default types", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      types: [{ value: "custom", label: "Custom" }]
    }));
    const config = loadVitConfig();
    const values = config.types.map(t => t.value);
    expect(values).toContain("custom");
    expect(values).toContain("feat"); // default preserved
  });

  test("existing default type label can be overridden", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      types: [{ value: "feat", label: "New Features!" }]
    }));
    const config = loadVitConfig();
    const feat = config.types.find(t => t.value === "feat");
    expect(feat.label).toBe("New Features!");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — projects normalization", () => {
  test("empty projects array falls back to default", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ projects: [] }));
    const config = loadVitConfig();
    expect(config.projects[0].id).toBe("core");
  });

  test("project without id gets auto id", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      projects: [{ label: "App", path: "./app" }]
    }));
    const config = loadVitConfig();
    expect(config.projects[0].id).toBe("project1");
  });

  test("project tagPrefix falls back to id", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      projects: [{ id: "api", path: "./api" }]
    }));
    const config = loadVitConfig();
    expect(config.projects[0].tagPrefix).toBe("api");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — ${VAR} interpolation", () => {
  test("interpolates env vars in string values", () => {
    process.env._VIT_TEST_VAR = "interpolated";
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      github: { token: "${_VIT_TEST_VAR}" }
    }));
    const config = loadVitConfig();
    expect(config.github.token).toBe("interpolated");
    delete process.env._VIT_TEST_VAR;
  });

  test("leaves unknown placeholder intact", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      github: { token: "${__NONEXISTENT_VAR__}" }
    }));
    const config = loadVitConfig();
    expect(config.github.token).toBe("${__NONEXISTENT_VAR__}");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("loadVitConfig — preReleaseBranches normalization", () => {
  test("filters branches without name", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      git: {
        preReleaseBranches: [
          { name: "alpha", id: "alpha" },
          { id: "no-name-here" }  // missing name → filtered out
        ]
      }
    }));
    const config = loadVitConfig();
    expect(config.git.preReleaseBranches).toHaveLength(1);
    expect(config.git.preReleaseBranches[0].name).toBe("alpha");
  });

  test("defaults id to name when id is not a string", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      git: {
        preReleaseBranches: [{ name: "beta" }]  // no id
      }
    }));
    const config = loadVitConfig();
    expect(config.git.preReleaseBranches[0].id).toBe("beta");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("checkReleaseBranch", () => {
  test("returns allowed=true when releaseBranches is empty", () => {
    expect(checkReleaseBranch([], "main").allowed).toBe(true);
  });

  test("returns allowed=true when releaseBranches is not an array", () => {
    expect(checkReleaseBranch(null, "main").allowed).toBe(true);
  });

  test("matches exact branch name", () => {
    const result = checkReleaseBranch(["main"], "main");
    expect(result.allowed).toBe(true);
    expect(result.matched).toBe("main");
  });

  test("does not match different branch", () => {
    expect(checkReleaseBranch(["main"], "develop").allowed).toBe(false);
  });

  test("supports wildcard pattern", () => {
    expect(checkReleaseBranch(["release/*"], "release/1.0").allowed).toBe(true);
  });

  test("wildcard does not match partial prefix without separator", () => {
    // 'release/*' should NOT match 'releases'
    expect(checkReleaseBranch(["release/*"], "releases").allowed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("getPreReleaseBranch", () => {
  const branches = [
    { name: "alpha", id: "alpha" },
    { name: "beta",  id: "beta"  },
  ];

  test("returns branch entry when name matches", () => {
    expect(getPreReleaseBranch(branches, "alpha")).toEqual({ name: "alpha", id: "alpha" });
  });

  test("returns null when no match", () => {
    expect(getPreReleaseBranch(branches, "develop")).toBeNull();
  });

  test("returns null for empty array", () => {
    expect(getPreReleaseBranch([], "alpha")).toBeNull();
  });

  test("returns null when preReleaseBranches is null/undefined", () => {
    expect(getPreReleaseBranch(null, "alpha")).toBeNull();
    expect(getPreReleaseBranch(undefined, "alpha")).toBeNull();
  });
});
