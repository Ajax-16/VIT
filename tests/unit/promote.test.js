import { jest } from '@jest/globals';

// ── fs mock ──────────────────────────────────────────────────────────────────
const mockReadFileSync = jest.fn();
jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

// ── child_process mock ───────────────────────────────────────────────────────
const mockExecSync = jest.fn().mockReturnValue('');
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  spawn: jest.fn(),
}));

// ── ora mock (already in __mocks__ but re-ensure) ────────────────────────────
const mockSpinner = { start: jest.fn(), succeed: jest.fn(), fail: jest.fn(), warn: jest.fn(), text: '' };
mockSpinner.start.mockReturnValue(mockSpinner);

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => mockSpinner),
}));

const { promoteMerge, promotePr } = await import('../../lib/promote.js');

// ── helpers ───────────────────────────────────────────────────────────────────
function makeVcs(overrides = {}) {
  return {
    supportsVersioning: jest.fn().mockReturnValue(true),
    isDirty:            jest.fn().mockReturnValue(false),
    getCurrentBranch:   jest.fn().mockReturnValue('alpha'),
    getSha:             jest.fn().mockReturnValue('abc1234'),
    checkout:           jest.fn(),
    merge:              jest.fn(),
    mergeAbort:         jest.fn(),
    resetHard:          jest.fn(),
    pushForce:          jest.fn(),
    addAll:             jest.fn(),
    commit:             jest.fn(),
    tag:                jest.fn(),
    pushWithTags:       jest.fn(),
    getRemoteUrl:       jest.fn().mockReturnValue('https://github.com/owner/repo.git'),
    ...overrides,
  };
}

function makeConfig(overrides = {}) {
  return {
    projects: [{ id: 'core', label: 'Core', path: '.', tagPrefix: 'v' }],
    git: { releaseBranches: ['main'] },
    ...overrides,
  };
}

function makeArgs(vcsOverrides = {}, configOverrides = {}) {
  return {
    branch: 'alpha',
    targetBranch: 'main',
    bumpResult: { targets: ['core'], bumpType: 'promote', preId: null },
    commitMessage: 'chore: promote',
    config: makeConfig(configOverrides),
    vcs: makeVcs(vcsOverrides),
    dryRun: false,
    spinner: mockSpinner,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSpinner.start.mockReturnValue(mockSpinner);
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.1.0-alpha.3' }));
  mockExecSync.mockReturnValue('');
});

// ═════════════════════════════════════════════════════════════════════════════
describe('promoteMerge()', () => {

  describe('dry-run', () => {
    test('does not call vcs.checkout or vcs.merge', async () => {
      const args = makeArgs();
      args.dryRun = true;
      await promoteMerge(args);
      expect(args.vcs.checkout).not.toHaveBeenCalled();
      expect(args.vcs.merge).not.toHaveBeenCalled();
    });

    test('returns empty bumpedProjects and null tag', async () => {
      const args = makeArgs();
      args.dryRun = true;
      const result = await promoteMerge(args);
      expect(result.tag).toBeNull();
      expect(result.bumpedProjects).toHaveLength(0);
    });

    test('calls spinner.succeed with dry-run message', async () => {
      const args = makeArgs();
      args.dryRun = true;
      await promoteMerge(args);
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });
  });

  describe('dirty working tree', () => {
    test('throws and does not proceed with checkout', async () => {
      const args = makeArgs({ isDirty: jest.fn().mockReturnValue(true) });
      await expect(promoteMerge(args)).rejects.toThrow('Dirty working tree');
      expect(args.vcs.checkout).not.toHaveBeenCalled();
    });

    test('calls spinner.fail', async () => {
      const args = makeArgs({ isDirty: jest.fn().mockReturnValue(true) });
      try { await promoteMerge(args); } catch { /* expected */ }
      expect(mockSpinner.fail).toHaveBeenCalled();
    });
  });

  describe('merge failure', () => {
    test('aborts merge and checks out original branch on error', async () => {
      const mergeError = new Error('merge conflict');
      const vcs = makeVcs({ merge: jest.fn().mockRejectedValue(mergeError) });
      // merge is sync in the real code — mock as throwing
      vcs.merge = jest.fn().mockImplementation(() => { throw mergeError; });
      const args = makeArgs();
      args.vcs = vcs;
      await expect(promoteMerge(args)).rejects.toThrow('merge conflict');
      expect(vcs.mergeAbort).toHaveBeenCalled();
      expect(vcs.checkout).toHaveBeenCalledWith('alpha'); // back to original branch
    });
  });

  describe('successful promotion', () => {
    test('checkouts targetBranch, merges, then bumps', async () => {
      const args = makeArgs();
      await promoteMerge(args);
      expect(args.vcs.checkout).toHaveBeenCalledWith('main');
      expect(args.vcs.merge).toHaveBeenCalled();
    });

    test('calls pushWithTags after bump', async () => {
      const args = makeArgs();
      await promoteMerge(args);
      expect(args.vcs.pushWithTags).toHaveBeenCalled();
    });

    test('syncs prerelease branch back after pushing target', async () => {
      const args = makeArgs();
      await promoteMerge(args);
      // Last checkout should be back to the prerelease branch
      const checkoutCalls = args.vcs.checkout.mock.calls.map(c => c[0]);
      expect(checkoutCalls).toContain('alpha');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('promotePr()', () => {

  describe('missing token', () => {
    test('throws with missing GitHub token message', async () => {
      const originalEnv = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      const args = makeArgs();
      await expect(promotePr(args)).rejects.toThrow('Missing GitHub token');
      process.env.GITHUB_TOKEN = originalEnv;
    });
  });

  describe('missing repo slug', () => {
    test('throws when remote URL is not a github.com URL', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';
      const args = makeArgs({
        getRemoteUrl: jest.fn().mockReturnValue('https://gitlab.com/owner/repo.git'),
      });
      args.config = makeConfig({ github: { token: 'tok' } });
      await expect(promotePr(args)).rejects.toThrow('Missing GitHub repo slug');
      delete process.env.GITHUB_TOKEN;
    });
  });

  describe('dry-run', () => {
    test('does not bump or push', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';
      const args = makeArgs();
      args.dryRun = true;
      args.config = makeConfig({ github: { token: 'tok', repo: 'owner/repo' } });
      await promotePr(args);
      expect(args.vcs.pushWithTags).not.toHaveBeenCalled();
      delete process.env.GITHUB_TOKEN;
    });

    test('returns null tag and empty bumpedProjects', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';
      const args = makeArgs();
      args.dryRun = true;
      args.config = makeConfig({ github: { token: 'tok', repo: 'owner/repo' } });
      const result = await promotePr(args);
      expect(result.tag).toBeNull();
      expect(result.bumpedProjects).toHaveLength(0);
      delete process.env.GITHUB_TOKEN;
    });
  });
});
