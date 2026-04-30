import { jest } from '@jest/globals';

jest.unstable_mockModule('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
    text: '',
  })),
}));

const { runSync } = await import('../../lib/sync.js');

// ── helpers ───────────────────────────────────────────────────────────────────
function makeVcs(overrides = {}) {
  return {
    isDirty:        jest.fn().mockReturnValue(false),
    getCurrentBranch: jest.fn().mockReturnValue('main'),
    fetchAll:       jest.fn(),
    checkout:       jest.fn(),
    pullFfOnly:     jest.fn(),
    commitsBehind:  jest.fn().mockReturnValue(0),
    getSha:         jest.fn().mockReturnValue('abc1234'),
    merge:          jest.fn(),
    mergeAbort:     jest.fn(),
    resetHard:      jest.fn(),
    push:           jest.fn(),
    ...overrides,
  };
}

function makeConfig(preReleaseBranches = ['alpha'], releaseBranches = ['main']) {
  return {
    git: { releaseBranches, preReleaseBranches },
  };
}

beforeEach(() => jest.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
describe('runSync()', () => {

  describe('dirty working tree', () => {
    test('calls process.exit(1) without doing any git ops', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const vcs = makeVcs({ isDirty: jest.fn().mockReturnValue(true) });
      await expect(runSync({ config: makeConfig(), vcs, dryRun: false })).rejects.toThrow('exit');
      expect(vcs.fetchAll).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  describe('no preReleaseBranches configured', () => {
    test('returns early without fetching', async () => {
      const vcs = makeVcs();
      await runSync({ config: makeConfig([]), vcs, dryRun: false });
      expect(vcs.fetchAll).not.toHaveBeenCalled();
    });

    test('skips glob-only patterns', async () => {
      const vcs = makeVcs();
      await runSync({ config: makeConfig(['feature/*']), vcs, dryRun: false });
      expect(vcs.fetchAll).not.toHaveBeenCalled();
    });
  });

  describe('branches already up to date', () => {
    test('fetches but does not checkout the prerelease branch', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(0) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      expect(vcs.fetchAll).toHaveBeenCalledTimes(1);
      // checkout should only be for pulling the release branch + returning to original
      const checkoutCalls = vcs.checkout.mock.calls.map(c => c[0]);
      expect(checkoutCalls).not.toContain('alpha');
    });
  });

  describe('branch behind — needs sync', () => {
    test('checkouts prerelease branch and merges base into it', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(3) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      expect(vcs.checkout).toHaveBeenCalledWith('alpha');
      expect(vcs.merge).toHaveBeenCalled();
    });

    test('pushes prerelease branch after successful merge', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(2) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      expect(vcs.push).toHaveBeenCalledWith('alpha');
    });

    test('falls back to regular merge if ff-only fails', async () => {
      let mergeCallCount = 0;
      const vcs = makeVcs({
        commitsBehind: jest.fn().mockReturnValue(2),
        merge: jest.fn().mockImplementation((target, opts) => {
          mergeCallCount++;
          if (opts?.ffOnly && mergeCallCount === 1) throw new Error('not ff');
        }),
      });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      expect(vcs.merge).toHaveBeenCalledTimes(3); // 1 ff-only origin/alpha + 1 ff-only base fail + 1 regular merge
    });

    test('aborts and resets if both merge strategies fail (conflict)', async () => {
      const mergeError = new Error('conflict');
      const vcs = makeVcs({
        commitsBehind: jest.fn().mockReturnValue(2),
        merge: jest.fn().mockImplementation((target, opts) => {
          if (opts?.ffOnly || !opts?.ffOnly) throw mergeError;
        }),
      });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      expect(vcs.mergeAbort).toHaveBeenCalled();
      expect(vcs.resetHard).toHaveBeenCalled();
    });

    test('processes remaining branches even when one has a conflict', async () => {
      let branchCount = 0;
      const vcs = makeVcs({
        commitsBehind: jest.fn().mockReturnValue(1),
        merge: jest.fn().mockImplementation(() => {
          branchCount++;
          if (branchCount <= 2) throw new Error('conflict'); // alpha fails
        }),
      });
      // Two pre-release branches: alpha (conflict) + beta (ok)
      await runSync({ config: makeConfig(['alpha', 'beta']), vcs, dryRun: false });
      expect(vcs.checkout).toHaveBeenCalledWith('beta');
    });
  });

  describe('dry-run mode', () => {
    test('does NOT checkout prerelease branch', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(5) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: true });
      const checkoutCalls = vcs.checkout.mock.calls.map(c => c[0]);
      expect(checkoutCalls).not.toContain('alpha');
    });

    test('does NOT call vcs.merge for prerelease branches', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(5) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: true });
      // merge might be called for pulling release branch — but NOT for the prerelease sync itself
      const mergeCalls = vcs.merge.mock.calls.map(c => c[0]);
      expect(mergeCalls).not.toContain('main'); // in dry-run the prerelease merge is skipped
    });

    test('does NOT push', async () => {
      const vcs = makeVcs({ commitsBehind: jest.fn().mockReturnValue(5) });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: true });
      expect(vcs.push).not.toHaveBeenCalled();
    });
  });

  describe('returns to original branch', () => {
    test('checks out original branch at the end even after sync', async () => {
      const vcs = makeVcs({
        getCurrentBranch: jest.fn().mockReturnValue('alpha'),
        commitsBehind: jest.fn().mockReturnValue(1),
      });
      await runSync({ config: makeConfig(['alpha']), vcs, dryRun: false });
      const checkoutCalls = vcs.checkout.mock.calls.map(c => c[0]);
      expect(checkoutCalls[checkoutCalls.length - 1]).toBe('alpha');
    });
  });
});
