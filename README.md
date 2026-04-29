# VIT — Version It!

Interactive CLI tool to manage versions, changelogs and commits in single or multi-project repositories.

## Installation

```bash
npm install -g @ajax-16/vit
```

Verify the installation:

```bash
vit
```

---
<a id="quick-start"></a>
## Quick start — `vit init`

The fastest way to configure VIT in a new project:

```bash
vit init
```

This creates two files in the current directory:

- **`vit-config.json`** — ready-to-edit configuration with sensible defaults.
- **`.vscode/settings.json`** — enables IntelliSense for `vit-config.json` in VS Code automatically.

```
  ✔  vit-config.json created.
  ✔  .vscode/settings.json created.

  VIT  Project initialized. Edit vit-config.json to configure.
```

> If either file already exists, `vit init` skips it without overwriting anything.

### VS Code IntelliSense

Once initialized, VS Code provides autocompletion, inline documentation and validation for every field in `vit-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Ajax-16/VIT/main/vit-config.schema.json",
  "changelog": { ... }
}
```

To enable it manually in an existing project, add this to your `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["vit-config.json"],
      "url": "https://raw.githubusercontent.com/Ajax-16/VIT/main/vit-config.schema.json"
    }
  ]
}
```

---

## Usage

Run `vit` at the root of your project. VIT will look for a `vit-config.json` file in the current directory.

```
  VIT   Version It!  v1.0.0

  VCS            : git
  Current branch : main
  Last tag       : v1.2.3

? Welcome. What do you want to do?
  🚀  Version it!  — bump + changelog + commit
  📋  Changelog    — add or edit entries
  💾  Commit       — commit and push without bump
  ⏫  Promote      — merge into main + stable release
  🔄  Sync         — sync prerelease branches with main
  ⏪  Rollback     — roll back to a tag
  ❌  Exit
```

> **Note:** `Promote` and `Sync` only appear in the interactive menu when relevant (promote requires being on a prerelease branch).

### Available actions

| Action          | Description                                              |
| --------------- | -------------------------------------------------------- |
| **Version it!** | Version bump + changelog + commit + tag + push           |
| **Changelog**   | Add or edit changelog entries without bumping            |
| **Commit**      | Commit and push without modifying versions               |
| **Promote**     | Promote a prerelease branch into a stable release        |
| **Sync**        | Sync prerelease branches that are behind their base      |
| **Rollback**    | Revert the repository to a previous tag                  |

---

## CLI Arguments

You can pass arguments directly when running `vit` to skip steps in the interactive flow.

```bash
vit [command] [options]
```

### Commands

| Command     | Alias | Description                                                    |
| ----------- | ----- | -------------------------------------------------------------- |
| `release`   | `r`   | Run the release flow                                           |
| `commit`    | `c`   | Run a commit without bumping                                   |
| `changelog` | `cl`  | Open the changelog flow                                        |
| `rollback`  | `rb`  | Revert to a previous tag                                       |
| `promote`   | `pr`  | Promote prerelease branch into stable release                  |
| `sync`      | `sy`  | Sync prerelease branches that are behind their release branch  |

### Options

| Option             | Alias | Description                                                                     |
| ------------------ | ----- | ------------------------------------------------------------------------------- |
| `--bump <type>`    | `-b`  | Bump type: `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`        |
| `--message <msg>`  | `-m`  | Commit message                                                                  |
| `--tag <tag>`      | `-t`  | Target tag for rollback                                                         |
| `--projects <ids>` | `-p`  | Comma-separated project IDs (monorepo)                                          |
| `--target <branch>`|       | Target release branch for promote (default: first in `releaseBranches`)         |
| `--semantic`       | `-s`  | Force semantic changelog mode for this run                                      |
| `--yes`            | `-y`  | Skip all prompts and confirmations, use defaults or provided flags              |
| `--dry-run`        | `-d`  | Simulate the operation without writing or pushing                               |
| `--version`        | `-v`  | Show VIT version                                                                |
| `--help`           | `-h`  | Show help                                                                       |

### Non-interactive mode (`--yes`)

`--yes` (or `-y`) skips **all** prompts and confirmations, using the values provided via flags or their defaults:

- Confirms all actions automatically.
- Selects all configured projects if `--projects` is not specified.
- Uses the default commit message if `--message` is not provided.
- In non-semantic mode, skips the changelog step silently.
- In semantic mode, regenerates the changelog automatically from git tags.

> **Important:** `--yes` does not guess required values. You must still provide `--bump` for `release` and `--message` for `commit`. Without them, VIT will exit with an error.

```bash
# ✅ Correct
vit release --bump patch --yes
vit commit --message "fix: typo" --yes

# ❌ Missing required flag
vit release --yes          # --bump is required
vit commit --yes           # --message is required
```

### Behavior by level

| Command                                    | What is skipped                                                  | What is still asked                         |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| `vit release`                              | Main menu                                                        | Bump type, changelog, message, confirmation |
| `vit release --bump patch`                 | Menu + bump type                                                 | Changelog, message, confirmation            |
| `vit release --bump patch --message "fix"` | Menu + bump + message                                            | Changelog, confirmation                     |
| `vit release --bump patch --yes`           | Everything                                                       | Nothing                                     |
| `vit commit --message "fix" --yes`         | Everything                                                       | Nothing                                     |
| `vit changelog --semantic --yes`           | Everything (regenerates full changelog from all tags)            | Nothing                                     |
| `vit rollback --tag v1.2.3 --yes`          | Everything                                                       | Nothing                                     |
| `vit promote --yes`                        | Everything (merges/promotes with defaults)                       | Nothing                                     |
| `vit sync`                                 | Everything (always non-interactive)                              | Nothing                                     |

### Examples

```bash
# Interactive release from the menu
vit

# Release skipping the menu, asks the rest
vit release

# Release with fixed bump, still asks for changelog and confirmation
vit release --bump minor

# Fully non-interactive release
vit release --bump patch --yes

# Non-interactive commit with custom message
vit commit --message "fix: typo" --yes

# Rollback to a specific tag without confirmation
vit rollback --tag v1.2.3 --yes

# Simulate a release without writing anything
vit release --bump patch --dry-run

# Release in monorepo for backend only
vit release --bump patch --projects backend --yes

# Promote prerelease branch into main (merge strategy)
vit promote --yes

# Promote into a specific target branch
vit promote --target main --yes

# Sync prerelease branches
vit sync
vit sync --dry-run
```

---

## Prerelease flow

VIT has native support for prerelease branches. When you run `vit release` from a branch listed in `preReleaseBranches`, VIT automatically switches into prerelease mode.

### First prerelease bump

On the first release from a prerelease branch, VIT asks for the **magnitude of the upcoming stable release**:

```
? What magnitude will the final stable release be?
  prepatch  — anticipates a patch  (x.x.+1-alpha.0)
  preminor  — anticipates a minor  (x.+1.0-alpha.0)
  premajor  — anticipates a major  (+1.0.0-alpha.0)
```

### Subsequent prerelease bumps

Once a prerelease version exists, subsequent bumps on the same branch automatically use `prerelease`, incrementing the counter (e.g. `1.1.0-alpha.0` → `1.1.0-alpha.1`).

### Prerelease changelog behaviour

Prerelease iterations (`prepatch`, `preminor`, `premajor`, `prerelease`) **skip the changelog step** entirely. The changelog is only generated when the stable version is published via `promote`.

In semantic mode, prerelease tags are not emitted as separate entries in the changelog. Their commits accumulate and are grouped under the next stable release entry.

### Promote

When you are ready to publish the stable version, use `promote` from the prerelease branch:

```bash
vit promote
vit promote --yes
vit promote --target main --yes
```

Promote:
1. Bumps all targets to the stable version (strips the prerelease suffix).
2. Runs the changelog step (if `semantic: true`, regenerates the full changelog).
3. Merges or opens a PR into the target release branch, depending on `promoteStrategy`.
4. Creates the stable tag.

See [`git.promoteStrategy`](#gitpromotestrategy) for merge vs PR configuration.

### Sync

`vit sync` checks all branches listed in `preReleaseBranches` and merges any commits from their base release branch that are missing:

```bash
vit sync
vit sync --dry-run
```

This is useful to keep prerelease branches up to date with hotfixes or other changes landed on `main`.

---

## Configuration — `vit-config.json`

Create a `vit-config.json` file at the root of your project or run [`vit init`](#quick-start) to generate one automatically:

```json
{
  "$schema": "https://raw.githubusercontent.com/Ajax-16/VIT/main/vit-config.schema.json",
  "changelog": {
    "path": "./CHANGELOG.md",
    "title": "Changelog",
    "semantic": false
  },
  "git": {
    "defaultCommitMessage": "chore: update",
    "releaseCommitMessage": "chore: release",
    "changelogCommitMessage": "docs: update changelog",
    "strict": true,
    "releaseBranches": ["main"],
    "rollbackStrategy": "revert",
    "promoteStrategy": "merge",
    "preReleaseBranches": [
      { "id": "alpha", "name": "alpha" }
    ]
  },
  "vcs": {
    "provider": "git"
  },
  "envFile": ".env",
  "projects": [
    {
      "id": "my-project",
      "label": "My Project",
      "path": ".",
      "tagPrefix": "v"
    }
  ]
}
```

### `changelog`

| Field      | Type      | Default          | Description                                                                                                                         |
| ---------- | --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `path`     | `string`  | `./CHANGELOG.md` | Path to the changelog file                                                                                                          |
| `title`    | `string`  | `Changelog`      | Changelog title                                                                                                                     |
| `semantic` | `boolean` | `false`          | If `true`, the changelog is automatically generated from commits using [Conventional Commits](https://www.conventionalcommits.org/) |

#### Semantic changelog

When `semantic: true`, VIT analyzes the commit history since the last tag and automatically generates the changelog by grouping commits by type (`feat`, `fix`, `refactor`…). The expected commit message format is:

```
<type>(<optional scope>): <description>
```

Valid examples:

```
feat: new login screen
fix(api): correct timeout on slow requests
refactor(auth): extract validation logic
```

Commits that don't follow this format are automatically ignored.

**Interactive flow** — VIT shows the detected commits, lets you deselect the ones you don't want to include, and optionally asks for an introductory text before saving.

**With `--yes`** — the changelog is silently regenerated without prompts.

**You can also force semantic mode for a single run** without changing `vit-config.json` using the `--semantic` flag:

```bash
vit changelog --semantic --yes
vit release --bump minor --semantic --yes
```

```json
"changelog": {
  "path": "./CHANGELOG.md",
  "title": "Changelog",
  "semantic": true
}
```

### `git`

| Field                    | Type       | Default                  | Description                                                          |
| ------------------------ | ---------- | ------------------------ | -------------------------------------------------------------------- |
| `defaultCommitMessage`   | `string`   | `chore: update`          | Default message for commits without bump                             |
| `releaseCommitMessage`   | `string`   | `chore: version bump`    | Default message for release commits                                  |
| `changelogCommitMessage` | `string`   | `docs: update changelog` | Default message for changelog commits                                |
| `releaseBranches`        | `string[]` | `[]`                     | Branches from which stable releases are allowed                      |
| `strict`                 | `boolean`  | `false`                  | If `true`, blocks the release when on a non-allowed branch           |
| `rollbackStrategy`       | `string`   | `"revert"`               | Rollback strategy: `"revert"` (default) or `"reset"`                 |
| `promoteStrategy`        | `string`   | `"merge"`                | Promote strategy: `"merge"` (local merge) or `"pr"` (GitHub PR)      |
| `preReleaseBranches`     | `array`    | `[]`                     | Branches treated as prerelease (see [Prerelease flow](#prerelease-flow)) |

#### Branch control for releases

You can restrict which branches can run a release using `releaseBranches` and `strict`.

**Warning mode** (`strict: false`, default)

If you are on a non-allowed branch, VIT shows a warning and asks if you want to continue anyway:

```
  WARNING   You are on branch "feat/my-feature", not on a release branch.
  Configured release branches: main

? Continue anyway? (y/N)
```

With `--yes`, the warning is automatically accepted and the release continues.

**Strict mode** (`strict: true`)

If you are on a non-allowed branch, the release is blocked:

```
  BLOCKED   Releases are not allowed from branch "feat/my-feature".
  Allowed branches: main
```

In `--dry-run` mode, strict blocking is ignored to allow simulations from any branch.

#### `git.promoteStrategy`

Controls how `vit promote` integrates the prerelease branch into the target release branch.

| Value     | Behaviour                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- |
| `"merge"` | Merges the prerelease branch locally into the target branch and pushes. *(default)*            |
| `"pr"`    | Opens a GitHub Pull Request from the prerelease branch into the target branch via the API.     |

When `"pr"` is selected and a PR already exists for the same head/base pair, VIT **reuses it** (updates title and body) instead of creating a duplicate.

The GitHub token must be available as `GITHUB_TOKEN` in the environment or via `envFile`:

```json
"git": {
  "promoteStrategy": "pr"
},
"envFile": ".env"
```

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

#### `git.preReleaseBranches`

List of branches that VIT treats as prerelease. Accepts strings or objects:

```json
"preReleaseBranches": [
  "alpha",
  { "id": "beta", "name": "beta" }
]
```

- When on one of these branches, `vit release` automatically enters prerelease mode.
- The `promote` command is only available from these branches.
- Prerelease tags (e.g. `v1.1.0-alpha.0`) are excluded as standalone entries in the semantic changelog.

#### Rollback strategy

`rollbackStrategy` controls how VIT undoes changes when rolling back to a previous tag.

Before executing, VIT always shows a **preview of the affected commits** and the active strategy:

```
  Commits that will be rolled back:  (strategy: revert)
  ─────────────────────────────────────────────────────
  · feat: new login screen
  · fix: fix bug in the form
  · chore: release v1.1.0

  Strategy  : revert — creates a new commit, history preserved
  Target tag: v1.0.0 (3 commit(s) affected)
```

**`"revert"` (default)** — creates a new commit that undoes the changes. History intact, normal push possible.

**`"reset"`** — moves HEAD to the target tag, rewriting history. Requires `git push --force`.

> With `reset`, VIT also offers to delete tags that were above the target tag.

### `vcs`

| Field      | Type     | Default | Description                              |
| ---------- | -------- | ------- | ---------------------------------------- |
| `provider` | `string` | `git`   | VCS provider. Currently supported: `git` |

### `projects`

Array of projects to manage. Useful for monorepos.

| Field       | Type     | Description                                                    |
| ----------- | -------- | -------------------------------------------------------------- |
| `id`        | `string` | Unique project identifier                                      |
| `label`     | `string` | Human-readable project name                                    |
| `path`      | `string` | Relative path to the project directory                         |
| `tagPrefix` | `string` | Prefix for git tags (`v` → `v1.2.3`, `vback` → `vback1.2.3`)  |

**Monorepo example:**

```json
"projects": [
  { "id": "backend",  "label": "Backend",  "path": "./Backend",  "tagPrefix": "vback" },
  { "id": "frontend", "label": "Frontend", "path": "./Frontend", "tagPrefix": "vfront" }
]
```

### `types` (optional)

Customize the commit types available in the changelog.

```json
"types": [
  { "value": "feat",   "label": "🚀 Features",     "choiceLabel": "🚀 feat     — New feature" },
  { "value": "fix",    "label": "🐛 Bug Fixes",     "choiceLabel": "🐛 fix      — Bug fix" },
  { "value": "chore",  "label": "🔧 Maintenance",   "choiceLabel": "🔧 chore    — Maintenance" },
  { "value": "deploy", "label": "🌍 Deployment",    "choiceLabel": "🌍 deploy   — Deployment / infra" }
]
```

Default types included: `feat`, `fix`, `refactor`, `perf`, `revert`, `docs`, `style`.

### `envFile` (optional)

Path to a global `.env` file whose variables will be available in **all** actions.

```json
{
  "envFile": ".env"
}
```

---

## Variable interpolation — `${VAR}`

VIT supports `${VAR}` placeholder interpolation across **all string values** in `vit-config.json`. Variables are resolved from:

1. `process.env` (environment variables already in scope)
2. The global `envFile` (loaded before interpolation)

This makes it easy to inject secrets, tokens or dynamic values without hardcoding them:

```json
{
  "envFile": ".env",
  "postActions": [
    {
      "id": "deploy",
      "command": "scp ./dist ${DEPLOY_USER}@${SERVER_HOST}:/var/www"
    }
  ]
}
```

```env
DEPLOY_USER=deploy-bot
SERVER_HOST=production.myserver.com
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### Built-in VIT variables

VIT exposes a set of built-in variables automatically available in any config string:

| Variable              | Value                                      |
| --------------------- | ------------------------------------------ |
| `${branch}`           | Current git branch                         |
| `${last_tag}`         | Last git tag                               |
| `${version}`          | current project version                                |

---

## Pre-actions and Post-actions

VIT allows you to run commands automatically before (`preActions`) and after (`postActions`) each operation.

```json
{
  "preActions": [...],
  "postActions": [...]
}
```

### Action structure

```json
{
  "id": "my-action",
  "label": "Visible description",
  "on": ["release", "commit"],
  "cwd": "./Backend",
  "continueOnError": false,
  "showOutput": true,
  "timeoutMs": 30000,
  "envFile": ".env.production",
  "env": {
    "NODE_ENV": "production"
  },
  "promptEnv": [
    { "name": "SSH_PASS", "message": "SSH password:" }
  ],
  "pipeline": [...],
  "command": "npm test"
}
```

| Field             | Type       | Default       | Description                                                                      |
| ----------------- | ---------- | ------------- | -------------------------------------------------------------------------------- |
| `id`              | `string`   | auto          | Unique identifier                                                                |
| `label`           | `string`   | `command`     | Text shown in the spinner                                                        |
| `on`              | `string[]` | `["release"]` | Triggers: `release`, `commit`, `changelog`, `prerelease`                         |
| `cwd`             | `string`   | `.`           | Working directory for the command                                                |
| `continueOnError` | `boolean`  | `false`       | If `true`, an error doesn't stop execution                                       |
| `showOutput`      | `boolean`  | `true`        | Show stdout/stderr in real time                                                  |
| `timeoutMs`       | `number`   | `null`        | Timeout in ms. `null` = no limit                                                 |
| `envFile`         | `string`   | `null`        | Path to a `.env` specific to this action (higher priority than global `envFile`) |
| `env`             | `object`   | `{}`          | Static environment variables (higher priority than `envFile`)                    |
| `promptEnv`       | `array`    | `[]`          | Variables asked interactively before running (highest priority)                  |
| `pipeline`        | `array`    | `[]`          | Previous steps that enrich the command's environment                             |
| `command`         | `string`   | —             | Main command to execute                                                          |

### Available triggers

| Trigger     | When it runs                           |
| ----------- | -------------------------------------- |
| `release`   | When bumping the version               |
| `prerelease`| When bumping the a prerelease version  |
| `commit`    | When committing without bump           |
| `changelog` | When committing a changelog            |

### `promptEnv`

Allows asking for sensitive values (passwords, tokens) right before running the action, without storing them anywhere.

```json
"promptEnv": [
  { "name": "SSH_PASS",     "message": "SSH password:" },
  { "name": "DEPLOY_TOKEN", "message": "Deploy token:" }
]
```

> **Note:** `promptEnv` has the highest priority in VIT. Even when running with `--yes`, the process will pause until it receives user input for any `promptEnv` variables.

---

## Environment variables and `envFile`

VIT supports loading environment variables from `.env` files at two levels: **global** (for all actions) and **per action** (only for that action).

### Priority order (lower → higher)

```
process.env  →  global envFile  →  action envFile  →  action.env  →  promptEnv
```

### Global `envFile`

Defined at the root of `vit-config.json`. Its variables are available in all actions and in `${VAR}` interpolation.

```json
{
  "envFile": ".env",
  "preActions": [...]
}
```

### Per-action `envFile`

Defined inside a specific action. Overrides variables from the global `envFile` with the same name.

```json
{
  "id": "deploy",
  "envFile": ".env.production",
  "command": "scp ./dist ${DEPLOY_USER}@${SERVER_HOST}:/var/www"
}
```

> **Note:** `.env` files are parsed internally without needing `dotenv`. Comments (`# comment`), blank lines and quoted values are supported.

---

## Step pipeline

The `pipeline` of an action is a list of commands that run **before** the main `command`. Each step can capture its stdout as an environment variable available to subsequent steps and the final `command` via `${VAR}` interpolation.

```json
"pipeline": [
  {
    "id": "node-version",
    "command": "node -e \"process.stdout.write(process.versions.node)\"",
    "captureAs": "NODE_VERSION"
  },
  {
    "id": "git-branch",
    "command": "git rev-parse --abbrev-ref HEAD",
    "captureAs": "GIT_BRANCH"
  }
],
"command": "node -e \"console.log('Node: ${NODE_VERSION} — Branch: ${GIT_BRANCH}')\""
```

### Pipeline step fields

| Field             | Type      | Default         | Description                                         |
| ----------------- | --------- | --------------- | --------------------------------------------------- |
| `id`              | `string`  | auto            | Unique identifier                                   |
| `label`           | `string`  | `command`       | Text shown in the spinner                           |
| `command`         | `string`  | —               | Command to execute                                  |
| `captureAs`       | `string`  | `null`          | Variable to store stdout in                         |
| `cwd`             | `string`  | `process.cwd()` | Working directory                                   |
| `continueOnError` | `boolean` | `false`         | If `true`, an error doesn't stop the pipeline       |
| `showOutput`      | `boolean` | `false`         | Show stdout (usually unnecessary in pipeline steps) |
| `timeoutMs`       | `number`  | `null`          | Timeout in ms                                       |

---

## Pipeline vs. multiple actions

### Pipeline — steps inside an action

- All steps **share the same accumulated environment**.
- Their purpose is to **prepare dynamic data** to build the main command.
- They have no `on`, `promptEnv` or `env` of their own.

### Multiple actions — independent tasks

- Each action has its own `on`, `cwd`, `env`, `envFile`, `promptEnv`, `showOutput` and `timeoutMs`.
- Each one appears as a separate block with its own spinner in the UI.
- **They do not share variables** between them.

### Practical rule

| Situation                                                          | Use              |
| ------------------------------------------------------------------ | ---------------- |
| I need the result of step A to build command B                     | `pipeline`       |
| They are independent tasks that could run separately               | separate actions |
| I want each task to have its own clearly visible label and spinner | separate actions |
| I want to prepare context before a complex command                 | `pipeline`       |

---

## Advanced examples

### Docker build with automatic version tag

```json
{
  "id": "docker-build",
  "label": "Build Docker",
  "on": ["release"],
  "showOutput": true,
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(require('./package.json').name)\"",
      "captureAs": "APP_NAME"
    }
  ],
  "command": "docker build -t ${APP_NAME}:${VERSION} -t ${APP_NAME}:latest ."
}
```

---

### SCP deploy with password asked at runtime

```json
{
  "id": "deploy-production",
  "label": "Deploy to production",
  "on": ["release"],
  "showOutput": true,
  "promptEnv": [
    { "name": "SSH_PASS", "message": "Production server SSH password:" }
  ],
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,10).replace(/-/g,''))\"",
      "captureAs": "DATE"
    }
  ],
  "command": "sshpass -p ${SSH_PASS} scp -r ./dist user@myserver.com:/var/www/releases/${VERSION}-${DATE}"
}
```

---

### Publish to npm only if the version doesn't exist yet

```json
{
  "id": "npm-publish",
  "label": "Publish to npm",
  "on": ["release"],
  "showOutput": true,
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(require('./package.json').name)\"",
      "captureAs": "PKG_NAME"
    },
    {
      "id": "check-published",
      "command": "npm view ${PKG_NAME}@${VERSION} version",
      "captureAs": "PUBLISHED_VERSION",
      "continueOnError": true
    }
  ],
  "command": "node -e \"if ('${PUBLISHED_VERSION}' === '${VERSION}') { console.log('Version ${VERSION} already published, skipping.'); process.exit(0); } require('child_process').execSync('npm publish', { stdio: 'inherit' });\""
}
```

---

### Slack notification on release

```json
{
  "id": "notify-slack",
  "label": "Notify Slack",
  "on": ["release"],
  "continueOnError": true,
  "showOutput": false,
  "promptEnv": [{ "name": "SLACK_WEBHOOK", "message": "Slack Webhook URL:" }],
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "git rev-parse --abbrev-ref HEAD",
      "captureAs": "BRANCH"
    },
    {
      "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,16).replace('T',' '))\"",
      "captureAs": "DATE"
    }
  ],
  "command": "curl -s -X POST ${SLACK_WEBHOOK} -H 'Content-type: application/json' --data '{\"text\":\"🚀 *Release v${VERSION}* published from `${BRANCH}` on ${DATE}\"}'"
}
```

---

### Full monorepo: preflight + tests + build + deploy + summary

```json
{
  "git": {
    "strict": true,
    "releaseBranches": ["main"],
    "promoteStrategy": "merge",
    "preReleaseBranches": [
      { "id": "alpha", "name": "alpha" }
    ]
  },
  "envFile": ".env",
  "projects": [
    { "id": "backend",  "label": "Backend",  "path": "./Backend",  "tagPrefix": "vback" },
    { "id": "frontend", "label": "Frontend", "path": "./Frontend", "tagPrefix": "vfront" }
  ],
  "preActions": [
    {
      "id": "test-backend",
      "label": "Backend tests",
      "on": ["release"],
      "cwd": "./Backend",
      "showOutput": true,
      "command": "npm test"
    },
    {
      "id": "build-frontend",
      "label": "Frontend build",
      "on": ["release"],
      "cwd": "./Frontend",
      "showOutput": true,
      "command": "npm run build"
    }
  ],
  "postActions": [
    {
      "id": "deploy",
      "label": "Deploy to production",
      "on": ["release"],
      "showOutput": true,
      "envFile": ".env.production",
      "promptEnv": [{ "name": "SSH_PASS", "message": "SSH password:" }],
      "pipeline": [
        {
          "command": "node -e \"process.stdout.write(require('./Backend/package.json').version)\"",
          "captureAs": "BACK_VERSION"
        },
        {
          "command": "node -e \"process.stdout.write(require('./Frontend/package.json').version)\"",
          "captureAs": "FRONT_VERSION"
        }
      ],
      "command": "sshpass -p ${SSH_PASS} ssh ${DEPLOY_USER}@${SERVER_HOST} \"cd /var/www && ./deploy.sh ${BACK_VERSION} ${FRONT_VERSION}\""
    }
  ]
}
```

---

## Error handling

When a command fails, VIT shows a clean message and saves the full stack trace to a temporary log file:

```
  ERROR   "Tests" failed (exit 1)

  Log saved to:
  C:\Users\user\AppData\Local\Temp\vit-logs\vit-error-1745678912345.log
```

Logs are saved in `{tmpdir}/vit-logs/` with the format `vit-error-{timestamp}.log`.

---

## Requirements

- Node.js >= 18
- Git installed and configured

---

## License

MIT
