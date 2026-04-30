import { parseArgs, COMMANDS, OPTIONS } from '../../lib/cli.js';

// ═════════════════════════════════════════════════════════════════════════════
describe('parseArgs() — commands', () => {

  test.each([
    [['release'],   'release'],
    [['r'],         'release'],
    [['commit'],    'commit'],
    [['c'],         'commit'],
    [['changelog'], 'changelog'],
    [['cl'],        'changelog'],
    [['rollback'],  'rollback'],
    [['rb'],        'rollback'],
    [['promote'],   'promote'],
    [['pr'],        'promote'],
    [['sync'],      'sync'],
    [['sy'],        'sync'],
    [['init'],      'init'],
    [['i'],         'init'],
  ])('argv %j → command %s', (argv, expected) => {
    expect(parseArgs(argv).command).toBe(expected);
  });

  test('unknown token goes to unknown[] and command stays null', () => {
    const ctx = parseArgs(['foobar']);
    expect(ctx.command).toBeNull();
    expect(ctx.unknown).toContain('foobar');
  });

  test('no args → all defaults', () => {
    const ctx = parseArgs([]);
    expect(ctx.command).toBeNull();
    expect(ctx.bump).toBeNull();
    expect(ctx.yes).toBe(false);
    expect(ctx.dryRun).toBe(false);
    expect(ctx.help).toBe(false);
    expect(ctx.version).toBe(false);
    expect(ctx.unknown).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('parseArgs() — boolean flags', () => {

  test('--yes sets yes=true', () => {
    expect(parseArgs(['--yes']).yes).toBe(true);
  });

  test('-y sets yes=true', () => {
    expect(parseArgs(['-y']).yes).toBe(true);
  });

  test('--dry-run sets dryRun=true', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  test('-d sets dryRun=true', () => {
    expect(parseArgs(['-d']).dryRun).toBe(true);
  });

  test('--semantic sets semantic=true', () => {
    expect(parseArgs(['--semantic']).semantic).toBe(true);
  });

  test('-s sets semantic=true', () => {
    expect(parseArgs(['-s']).semantic).toBe(true);
  });

  test('--help sets help=true', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  test('-h sets help=true', () => {
    expect(parseArgs(['-h']).help).toBe(true);
  });

  test('--version sets version=true', () => {
    expect(parseArgs(['--version']).version).toBe(true);
  });

  test('-v sets version=true', () => {
    expect(parseArgs(['-v']).version).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('parseArgs() — value flags', () => {

  test('--bump patch', () => {
    expect(parseArgs(['--bump', 'patch']).bump).toBe('patch');
  });

  test('--bump=minor (inline =)', () => {
    expect(parseArgs(['--bump=minor']).bump).toBe('minor');
  });

  test('-b major', () => {
    expect(parseArgs(['-b', 'major']).bump).toBe('major');
  });

  test('--message sets message', () => {
    expect(parseArgs(['--message', 'chore: bump']).message).toBe('chore: bump');
  });

  test('-m sets message', () => {
    expect(parseArgs(['-m', 'fix: typo']).message).toBe('fix: typo');
  });

  test('--tag sets tag', () => {
    expect(parseArgs(['--tag', 'v1.2.3']).tag).toBe('v1.2.3');
  });

  test('-t sets tag', () => {
    expect(parseArgs(['-t', 'v0.9.0']).tag).toBe('v0.9.0');
  });

  test('--target sets target branch', () => {
    expect(parseArgs(['--target', 'main']).target).toBe('main');
  });

  test('--projects splits CSV into array', () => {
    expect(parseArgs(['--projects', 'core,frontend']).projects).toEqual(['core', 'frontend']);
  });

  test('-p with single project gives array of one', () => {
    expect(parseArgs(['-p', 'core']).projects).toEqual(['core']);
  });

  test('--projects trims whitespace around commas', () => {
    expect(parseArgs(['--projects', 'core , frontend , backend']).projects)
      .toEqual(['core', 'frontend', 'backend']);
  });

  test('flag without required value lands in unknown[]', () => {
    const ctx = parseArgs(['--bump']);
    expect(ctx.bump).toBeNull();
    expect(ctx.unknown).toContain('--bump');
  });

  test('flag followed by another flag (no value) lands in unknown[]', () => {
    const ctx = parseArgs(['--bump', '--yes']);
    expect(ctx.bump).toBeNull();
    expect(ctx.unknown).toContain('--bump');
    expect(ctx.yes).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('parseArgs() — combined real-world usage', () => {

  test('vit release --bump patch --yes', () => {
    const ctx = parseArgs(['release', '--bump', 'patch', '--yes']);
    expect(ctx.command).toBe('release');
    expect(ctx.bump).toBe('patch');
    expect(ctx.yes).toBe(true);
  });

  test('vit release --bump minor --dry-run --yes', () => {
    const ctx = parseArgs(['release', '--bump', 'minor', '--dry-run', '--yes']);
    expect(ctx.command).toBe('release');
    expect(ctx.dryRun).toBe(true);
    expect(ctx.yes).toBe(true);
  });

  test('vit rollback --tag v1.2.3 --yes', () => {
    const ctx = parseArgs(['rollback', '--tag', 'v1.2.3', '--yes']);
    expect(ctx.command).toBe('rollback');
    expect(ctx.tag).toBe('v1.2.3');
    expect(ctx.yes).toBe(true);
  });

  test('vit release --bump patch --projects core,frontend --message "chore: v2" --yes', () => {
    const ctx = parseArgs(['release', '--bump', 'patch', '--projects', 'core,frontend', '--message', 'chore: v2', '--yes']);
    expect(ctx.command).toBe('release');
    expect(ctx.projects).toEqual(['core', 'frontend']);
    expect(ctx.message).toBe('chore: v2');
  });

  test('vit promote --target staging --yes', () => {
    const ctx = parseArgs(['promote', '--target', 'staging', '--yes']);
    expect(ctx.command).toBe('promote');
    expect(ctx.target).toBe('staging');
  });

  test('vit sync --dry-run', () => {
    const ctx = parseArgs(['sync', '--dry-run']);
    expect(ctx.command).toBe('sync');
    expect(ctx.dryRun).toBe(true);
  });

  test('--dry-run before command is still parsed correctly', () => {
    const ctx = parseArgs(['--dry-run', 'release', '--bump', 'minor', '--yes']);
    expect(ctx.command).toBe('release');
    expect(ctx.dryRun).toBe(true);
    expect(ctx.bump).toBe('minor');
  });

  test('completely unknown flags go to unknown[]', () => {
    const ctx = parseArgs(['release', '--whatever', 'value']);
    expect(ctx.unknown).toContain('--whatever');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('COMMANDS and OPTIONS registries', () => {
  test('every COMMAND has at least one alias', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.aliases.length).toBeGreaterThan(0);
    }
  });

  test('every OPTION has a flag property', () => {
    for (const opt of OPTIONS) {
      expect(typeof opt.flag).toBe('string');
      expect(opt.flag.length).toBeGreaterThan(0);
    }
  });
});
