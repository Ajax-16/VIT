import { jest } from '@jest/globals';

// ── fs + child_process mocks ─────────────────────────────────────────────────
const mockExecSync     = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync   = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync:    mockExistsSync,
  readFileSync:  mockReadFileSync,
  writeFileSync: jest.fn(),
}));

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  spawn:    jest.fn(),
}));

const { getNextVersion, bump } = await import('../../lib/bump.js');

// ── helpers ──────────────────────────────────────────────────────────────────
function makePkg(version) {
  return JSON.stringify({ version });
}

function makeVcs({ supports = true } = {}) {
  return {
    supportsVersioning: jest.fn().mockReturnValue(supports),
    addAll:      jest.fn(),
    commit:      jest.fn(),
    tag:         jest.fn(),
    pushWithTags: jest.fn(),
  };
}

function makeConfig(projectOverrides = {}) {
  return {
    projects: [{
      id: 'core', label: 'Core', path: '.', tagPrefix: 'v',
      ...projectOverrides,
    }]
  };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('getNextVersion (pure)', () => {
  test.each([
    ['1.2.3', 'patch',  '1.2.4'],
    ['1.2.3', 'minor',  '1.3.0'],
    ['1.2.3', 'major',  '2.0.0'],
    ['0.0.0', 'patch',  '0.0.1'],
    ['0.0.0', 'minor',  '0.1.0'],
    ['0.0.0', 'major',  '1.0.0'],
    ['10.9.8', 'major', '11.0.0'],
    ['1.0.0', 'minor',  '1.1.0'],
  ])('%s + %s → %s', (current, type, expected) => {
    expect(getNextVersion(current, type)).toBe(expected);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('bump()', () => {

  describe('error cases', () => {
    test('throws when no valid targets match', async () => {
      const config = makeConfig();
      await expect(
        bump({ targets: ['nonexistent'], bumpType: 'patch', message: 'chore: bump', config, vcs: makeVcs(), dryRun: false })
      ).rejects.toThrow('No valid projects selected');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('dryRun mode', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(makePkg('1.2.3'));
    });

    test('does NOT call execSync (no npm version)', async () => {
      const vcs = makeVcs();
      await bump({
        targets: ['core'], bumpType: 'patch',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: true,
      });
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    test('does NOT call vcs methods', async () => {
      const vcs = makeVcs();
      await bump({
        targets: ['core'], bumpType: 'minor',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: true,
      });
      expect(vcs.commit).not.toHaveBeenCalled();
      expect(vcs.tag).not.toHaveBeenCalled();
      expect(vcs.pushWithTags).not.toHaveBeenCalled();
    });

    test('returns calculated next version', async () => {
      const vcs = makeVcs();
      const { bumpedProjects } = await bump({
        targets: ['core'], bumpType: 'minor',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: true,
      });
      expect(bumpedProjects[0].version).toBe('1.3.0');
    });

    test('tag is built with tagPrefix', async () => {
      const vcs = makeVcs();
      const { tag } = await bump({
        targets: ['core'], bumpType: 'patch',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: true,
      });
      expect(tag).toBe('v-1.2.4');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('live mode with vcs', () => {
    beforeEach(() => {
      // execSync simulates npm version writing the new version
      mockExecSync.mockImplementation(() => '');
      // readFileSync is called by getVersion after npm version ran
      mockReadFileSync.mockReturnValue(makePkg('1.2.4'));
    });

    test('calls npm version via execSync', async () => {
      const vcs = makeVcs();
      await bump({
        targets: ['core'], bumpType: 'patch',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: false,
      });
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm version patch --no-git-tag-version',
        expect.objectContaining({ cwd: expect.any(String) })
      );
    });

    test('calls vcs.addAll, commit, tag, pushWithTags', async () => {
      const vcs = makeVcs();
      await bump({
        targets: ['core'], bumpType: 'patch',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: false,
      });
      expect(vcs.addAll).toHaveBeenCalled();
      expect(vcs.commit).toHaveBeenCalled();
      expect(vcs.tag).toHaveBeenCalled();
      expect(vcs.pushWithTags).toHaveBeenCalled();
    });

    test('does NOT call vcs when supportsVersioning returns false', async () => {
      const vcs = makeVcs({ supports: false });
      await bump({
        targets: ['core'], bumpType: 'patch',
        message: 'chore: bump', config: makeConfig(), vcs, dryRun: false,
      });
      expect(vcs.commit).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  describe('monorepo — multiple projects', () => {
    const multiConfig = {
      projects: [
        { id: 'backend',  label: 'Backend',  path: './backend',  tagPrefix: 'vback' },
        { id: 'frontend', label: 'Frontend', path: './frontend', tagPrefix: 'vfront' },
      ]
    };

    beforeEach(() => {
      mockExecSync.mockImplementation(() => '');
      // readFileSync returns different versions per call
      mockReadFileSync
        .mockReturnValueOnce(makePkg('2.0.0'))
        .mockReturnValueOnce(makePkg('1.5.3'));
    });

    test('bumps both projects', async () => {
      const vcs = makeVcs();
      const { bumpedProjects } = await bump({
        targets: ['backend', 'frontend'], bumpType: 'patch',
        message: 'chore: bump', config: multiConfig, vcs, dryRun: false,
      });
      expect(bumpedProjects).toHaveLength(2);
    });

    test('tag is composed from both prefixes', async () => {
      const vcs = makeVcs();
      const { tag } = await bump({
        targets: ['backend', 'frontend'], bumpType: 'patch',
        message: 'chore: bump', config: multiConfig, vcs, dryRun: false,
      });
      expect(tag).toContain('vback');
      expect(tag).toContain('vfront');
    });

    test('only selected project is bumped', async () => {
      mockReadFileSync.mockReset();
      mockReadFileSync.mockReturnValue(makePkg('2.0.0'));
      const vcs = makeVcs();
      const { bumpedProjects } = await bump({
        targets: ['backend'], bumpType: 'minor',
        message: 'chore: bump', config: multiConfig, vcs, dryRun: false,
      });
      expect(bumpedProjects).toHaveLength(1);
      expect(bumpedProjects[0].id).toBe('backend');
    });
  });
});
