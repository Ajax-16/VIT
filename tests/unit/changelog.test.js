import { jest } from '@jest/globals';

// ── fs + child_process mocks ─────────────────────────────────────────────────
const mockExistsSync   = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExecSync     = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync:    mockExistsSync,
  readFileSync:  mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  spawn:    jest.fn(),
}));

const { parseAllTagsWithCommits, buildSemanticChangelog } = await import('../../lib/changelog.js');

// ── default config ────────────────────────────────────────────────────────────
const BASE_CONFIG = {
  changelog: { path: './CHANGELOG.md', title: 'Changelog', semantic: true },
  types: [
    { value: 'feat',     label: '🚀 Features',       choiceLabel: '🚀 feat' },
    { value: 'fix',      label: '🐛 Bug fixes',       choiceLabel: '🐛 fix' },
    { value: 'refactor', label: '🚜 Refactoring',     choiceLabel: '🚜 refactor' },
    { value: 'docs',     label: '📚 Documentation',   choiceLabel: '📚 docs' },
  ],
};

// ── git output helpers ────────────────────────────────────────────────────────
function gitTagsOutput(...tags) { return tags.join('\n'); }
function gitLogOutput(...subjects) { return subjects.map(s => `"${s}"`).join('\n'); }
function gitDateOutput(date = '2024-01-15') { return `${date} 12:00:00 +0000`; }

// ═════════════════════════════════════════════════════════════════════════════
describe('parseAllTagsWithCommits', () => {

  beforeEach(() => mockExecSync.mockReset());

  test('returns empty array when no tags exist', () => {
    mockExecSync.mockReturnValue('');
    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result).toEqual([]);
  });

  test('parses single tag with conventional commits', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))              // git tag --sort
      .mockReturnValueOnce(gitDateOutput('2024-01-10'))           // git log -1 --format=%ai
      .mockReturnValueOnce(gitLogOutput('feat: new login screen', 'fix: null pointer in auth'));

    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('v1.0.0');
    expect(result[0].commits).toHaveLength(2);
  });

  test('ignores commits not matching conventional format', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput(
        'feat: good commit',
        'this is not conventional',
        'WIP stuff',
        'fix: another good one',
      ));

    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result[0].commits).toHaveLength(2);
  });

  test('ignores commits with unknown types', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput(
        'feat: valid',
        'chore: maintenance',   // not in BASE_CONFIG types
        'deploy: deployment',   // not in BASE_CONFIG types
      ));

    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result[0].commits).toHaveLength(1);
    expect(result[0].commits[0].type).toBe('feat');
  });

  test('parses scope correctly', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('fix(api): handle timeout'));

    const commit = parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0];
    expect(commit.scope).toBe('api');
    expect(commit.description).toBe('handle timeout');
    expect(commit.breaking).toBe(false);
  });

  test('parses breaking change marker !', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v2.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat!: remove legacy API'));

    const commit = parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0];
    expect(commit.breaking).toBe(true);
  });

  test('parses breaking change with scope', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v2.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat(auth)!: new token format'));

    const commit = parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0];
    expect(commit.breaking).toBe(true);
    expect(commit.scope).toBe('auth');
  });

  test('handles multiple tags in reverse-chronological order', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v2.0.0', 'v1.0.0'))  // sorted newest first
      .mockReturnValueOnce(gitDateOutput('2024-06-01'))          // date v2.0.0
      .mockReturnValueOnce(gitLogOutput('feat: v2 feature'))     // commits v2
      .mockReturnValueOnce(gitDateOutput('2024-01-01'))          // date v1.0.0
      .mockReturnValueOnce(gitLogOutput('feat: initial release')); // commits v1

    const result = parseAllTagsWithCommits(BASE_CONFIG);
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe('v2.0.0');
    expect(result[1].tag).toBe('v1.0.0');
  });

  test('pendingTag creates virtual first entry', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))              // existing tags
      .mockReturnValueOnce(gitLogOutput('feat: unreleased feat')) // getCommitsToHead
      .mockReturnValueOnce(gitDateOutput('2024-01-10'))           // date v1.0.0
      .mockReturnValueOnce(gitLogOutput('feat: initial'));

    const result = parseAllTagsWithCommits(BASE_CONFIG, process.cwd(), { pendingTag: 'v1.1.0' });
    expect(result[0].tag).toBe('v1.1.0');
    expect(result[0].pending).toBe(true);
    expect(result[0].date).toBeNull();
  });

  test('commit without scope has scope: null', () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat: no scope here'));

    const commit = parseAllTagsWithCommits(BASE_CONFIG)[0].commits[0];
    expect(commit.scope).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('buildSemanticChangelog', () => {

  beforeEach(() => {
    mockExecSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  test('returns { saved: false } when no tags exist', async () => {
    mockExecSync.mockReturnValue('');
    const result = await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    expect(result.saved).toBe(false);
    expect(result.path).toBeNull();
  });

  test('writes file in headless mode when tags exist', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput('2024-01-10'))
      .mockReturnValueOnce(gitLogOutput('feat: first feature', 'fix: small fix'));

    const result = await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    expect(result.saved).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  test('written content starts with # Changelog header', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput('2024-01-10'))
      .mockReturnValueOnce(gitLogOutput('feat: a feature'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toMatch(/^# Changelog/);
  });

  test('written content includes version and date', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput('2024-03-15'))
      .mockReturnValueOnce(gitLogOutput('feat: a feature'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain('v1.0.0');
    expect(written).toContain('15/03/2024');
  });

  test('written content groups commits by type', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat: new thing', 'fix: bug fixed', 'feat: another thing'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain('🚀 Features');
    expect(written).toContain('🐛 Bug fixes');
    // feat appears before fix (type order)
    expect(written.indexOf('🚀 Features')).toBeLessThan(written.indexOf('🐛 Bug fixes'));
  });

  test('breaking change is marked with ❗', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v2.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat!: breaking new API'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain('❗');
  });

  test('scope is rendered in output', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('fix(auth): token refresh bug'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain('(auth)');
  });

  test('pendingTag appears as first section', async () => {
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))              // existing tags
      .mockReturnValueOnce(gitLogOutput('feat: pending feature')) // getCommitsToHead
      .mockReturnValueOnce(gitDateOutput('2024-01-10'))           // date v1.0.0
      .mockReturnValueOnce(gitLogOutput('feat: initial'));

    await buildSemanticChangelog(BASE_CONFIG, { headless: true, pendingTag: 'v1.1.0' });
    const written = mockWriteFileSync.mock.calls[0][1];
    const v110pos = written.indexOf('v1.1.0');
    const v100pos = written.indexOf('v1.0.0');
    expect(v110pos).toBeGreaterThanOrEqual(0);
    expect(v100pos).toBeGreaterThanOrEqual(0);
    expect(v110pos).toBeLessThan(v100pos);
  });

  test('custom changelog title is used in header', async () => {
    const cfg = { ...BASE_CONFIG, changelog: { ...BASE_CONFIG.changelog, title: 'Mi Changelog' } };
    mockExecSync
      .mockReturnValueOnce(gitTagsOutput('v1.0.0'))
      .mockReturnValueOnce(gitDateOutput())
      .mockReturnValueOnce(gitLogOutput('feat: algo'));

    await buildSemanticChangelog(cfg, { headless: true });
    const written = mockWriteFileSync.mock.calls[0][1];
    expect(written).toContain('# Mi Changelog');
  });
});
