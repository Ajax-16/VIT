import { jest } from '@jest/globals';

// ── fs mock ──────────────────────────────────────────────────────────────────
const mockExistsSync  = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync:   mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: jest.fn(),
}));

const { loadVitConfig, checkReleaseBranch } = await import('../../lib/config.js');

// ── helpers ──────────────────────────────────────────────────────────────────
const DEFAULT_FIELDS = ['changelog', 'git', 'vcs', 'projects', 'types', 'envFile', 'preActions', 'postActions'];

function cfgJson(overrides = {}) {
  return JSON.stringify(overrides);
}

// ═════════════════════════════════════════════════════════════════════════════
describe('loadVitConfig', () => {

  describe('no config file', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(false));

    test('returns default config with all expected keys', () => {
      const cfg = loadVitConfig();
      for (const key of DEFAULT_FIELDS) expect(cfg).toHaveProperty(key);
    });

    test('changelog defaults', () => {
      const { changelog } = loadVitConfig();
      expect(changelog.path).toBe('./CHANGELOG.md');
      expect(changelog.title).toBe('Changelog');
      expect(changelog.semantic).toBe(false);
    });

    test('git defaults', () => {
      const { git } = loadVitConfig();
      expect(git.rollbackStrategy).toBe('revert');
      expect(git.strict).toBe(false);
      expect(git.releaseBranches).toEqual([]);
    });

    test('default project is core', () => {
      const { projects } = loadVitConfig();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe('core');
    });

    test('default types include feat, fix, refactor', () => {
      const { types } = loadVitConfig();
      const values = types.map(t => t.value);
      expect(values).toContain('feat');
      expect(values).toContain('fix');
      expect(values).toContain('refactor');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('malformed / invalid JSON', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('NOT_JSON{{{}');
    });

    test('falls back to DEFAULT_CONFIG silently', () => {
      const cfg = loadVitConfig();
      expect(cfg.changelog.semantic).toBe(false);
      expect(cfg.git.rollbackStrategy).toBe('revert');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('partial config merging', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(true));

    test('preserves unset changelog defaults when only path provided', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ changelog: { path: './MY-CHANGES.md' } }));
      const { changelog } = loadVitConfig();
      expect(changelog.path).toBe('./MY-CHANGES.md');
      expect(changelog.title).toBe('Changelog');
      expect(changelog.semantic).toBe(false);
    });

    test('semantic: true is kept', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ changelog: { semantic: true } }));
      expect(loadVitConfig().changelog.semantic).toBe(true);
    });

    test('semantic non-boolean falls back to false', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ changelog: { semantic: 'yes' } }));
      expect(loadVitConfig().changelog.semantic).toBe(false);
    });

    test('rollbackStrategy "reset" is accepted', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ git: { rollbackStrategy: 'reset' } }));
      expect(loadVitConfig().git.rollbackStrategy).toBe('reset');
    });

    test('rollbackStrategy invalid value falls back to "revert"', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ git: { rollbackStrategy: 'squash' } }));
      expect(loadVitConfig().git.rollbackStrategy).toBe('revert');
    });

    test('releaseBranches filters empty strings', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ git: { releaseBranches: ['main', '', '  '] } }));
      expect(loadVitConfig().git.releaseBranches).toEqual(['main']);
    });

    test('strict non-boolean falls back to false', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ git: { strict: 'yes' } }));
      expect(loadVitConfig().git.strict).toBe(false);
    });

    test('envFile string is kept', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ envFile: '.env.prod' }));
      expect(loadVitConfig().envFile).toBe('.env.prod');
    });

    test('envFile non-string falls back to null', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ envFile: 42 }));
      expect(loadVitConfig().envFile).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('projects normalization', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(true));

    test('custom projects replace default', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        projects: [{ id: 'backend', label: 'Backend', path: './Backend', tagPrefix: 'vback' }]
      }));
      const { projects } = loadVitConfig();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe('backend');
      expect(projects[0].tagPrefix).toBe('vback');
    });

    test('missing tagPrefix defaults to id', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        projects: [{ id: 'web', label: 'Web', path: '.' }]
      }));
      expect(loadVitConfig().projects[0].tagPrefix).toBe('web');
    });

    test('empty projects array keeps default project', () => {
      mockReadFileSync.mockReturnValue(cfgJson({ projects: [] }));
      expect(loadVitConfig().projects[0].id).toBe('core');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('types merging', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(true));

    test('custom type overrides label of existing type', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        types: [{ value: 'feat', label: '✨ Features', choiceLabel: '✨ feat — custom' }]
      }));
      const { types } = loadVitConfig();
      const feat = types.find(t => t.value === 'feat');
      expect(feat.label).toBe('✨ Features');
    });

    test('new custom type is appended', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        types: [{ value: 'deploy', label: '🌍 Deploy', choiceLabel: '🌍 deploy' }]
      }));
      const { types } = loadVitConfig();
      const values = types.map(t => t.value);
      expect(values).toContain('deploy');
      expect(values).toContain('feat'); // defaults preserved
    });

    test('default types order is preserved for known types', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        types: [{ value: 'feat', label: '✨ New feat' }]
      }));
      const { types } = loadVitConfig();
      const index = (v) => types.findIndex(t => t.value === v);
      expect(index('feat')).toBeLessThan(index('fix'));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('actions normalization', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(true));

    test('preActions normalizes id, label and defaults', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        preActions: [{ command: 'npm test' }]
      }));
      const { preActions } = loadVitConfig();
      expect(preActions[0].id).toBe('action-1');
      expect(preActions[0].label).toBe('npm test');
      expect(preActions[0].continueOnError).toBe(false);
      expect(preActions[0].showOutput).toBe(true);
      expect(preActions[0].pipeline).toEqual([]);
      expect(preActions[0].on).toEqual(['release']);
    });

    test('action on:string is normalized to array', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        postActions: [{ command: 'deploy.sh', on: 'release' }]
      }));
      expect(loadVitConfig().postActions[0].on).toEqual(['release']);
    });

    test('pipeline steps inside action are normalized', () => {
      mockReadFileSync.mockReturnValue(cfgJson({
        preActions: [{
          command: 'echo ${VER}',
          pipeline: [{ command: 'node -e "process.stdout.write(\'1.0.0\')"', captureAs: 'VER' }]
        }]
      }));
      const step = loadVitConfig().preActions[0].pipeline[0];
      expect(step.captureAs).toBe('VER');
      expect(step.showOutput).toBe(false);
      expect(step.id).toBe('step-1');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('checkReleaseBranch', () => {

  test('empty array → always allowed', () => {
    expect(checkReleaseBranch([], 'feat/foo')).toEqual({ allowed: true, matched: null });
  });

  test('null/undefined → always allowed', () => {
    expect(checkReleaseBranch(null, 'main')).toEqual({ allowed: true, matched: null });
    expect(checkReleaseBranch(undefined, 'main')).toEqual({ allowed: true, matched: null });
  });

  test('exact match', () => {
    expect(checkReleaseBranch(['main'], 'main')).toEqual({ allowed: true, matched: 'main' });
  });

  test('exact match fails for different branch', () => {
    expect(checkReleaseBranch(['main'], 'develop')).toEqual({ allowed: false, matched: null });
  });

  test('glob release/* matches release/1.0', () => {
    expect(checkReleaseBranch(['release/*'], 'release/1.0')).toEqual({ allowed: true, matched: 'release/*' });
  });

  test('glob release/* does not match releaseX', () => {
    expect(checkReleaseBranch(['release/*'], 'releaseX')).toEqual({ allowed: false, matched: null });
  });

  test('multiple patterns — matches second one', () => {
    const result = checkReleaseBranch(['main', 'hotfix/*'], 'hotfix/urgent');
    expect(result.allowed).toBe(true);
    expect(result.matched).toBe('hotfix/*');
  });

  test('glob v* matches v1.2.3', () => {
    expect(checkReleaseBranch(['v*'], 'v1.2.3')).toEqual({ allowed: true, matched: 'v*' });
  });

  test('special regex chars in pattern are escaped', () => {
    // 'main.branch' should NOT match 'mainXbranch' (dot is literal)
    expect(checkReleaseBranch(['main.branch'], 'mainXbranch')).toEqual({ allowed: false, matched: null });
    expect(checkReleaseBranch(['main.branch'], 'main.branch')).toEqual({ allowed: true, matched: 'main.branch' });
  });
});
