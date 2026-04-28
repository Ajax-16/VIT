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

Run `vit` at the root of your project. VIT will look for a `vit-config.json` file in the current directory. If it doesn't exist, it will use the default configuration.

```
  VIT   Version It!  v1.0.0

  VCS            : git
  Current branch : main
  Last tag       : v1.2.3

? Welcome. What do you want to do?
  🚀  Version it!  — bump + changelog + commit
  📋  Changelog    — add or edit entries
  💾  Commit       — commit and push without bump
  ⏪  Rollback     — roll back to a tag
  ❌  Exit
```

### Available actions

| Action          | Description                                    |
| --------------- | ---------------------------------------------- |
| **Version it!** | Version bump + changelog + commit + tag + push |
| **Changelog**   | Add or edit changelog entries without bumping  |
| **Commit**      | Commit and push without modifying versions     |
| **Rollback**    | Revert the repository to a previous tag        |

---

## CLI Arguments

You can pass arguments directly when running `vit` to skip steps in the interactive flow. Prompts that already have a value from an argument are skipped; the rest continue normally.

```bash
vit [command] [options]
```

### Commands

| Command     | Description                  |
| ----------- | ---------------------------- |
| `release`   | Run the release flow         |
| `commit`    | Run a commit without bumping |
| `changelog` | Open the changelog flow      |
| `rollback`  | Revert to a previous tag     |

### Options

| Option             | Alias | Description                                                      |
| ------------------ | ----- | ---------------------------------------------------------------- |
| `--bump <type>`    | `-b`  | Bump type: `patch`, `minor` or `major`                           |
| `--message <msg>`  | `-m`  | Commit message                                                   |
| `--tag <tag>`      | `-t`  | Target tag for rollback                                          |
| `--projects <ids>` | `-p`  | Comma-separated project IDs (monorepo)                           |
| `--semantic`       | `-s`  | Enable semantic changelog mode                                   |
| `--yes`            | `-y`  | Confirm everything automatically without prompts (headless mode) |
| `--dry-run`        | `-d`  | Simulate the operation without writing or pushing                |
| `--version`        | `-v`  | Show VIT version                                                 |
| `--help`           | `-h`  | Show help                                                        |

### Behavior by level

Each argument skips only its corresponding prompt; the rest of the interactive flow continues normally.

| Command                                    | What is skipped                                                | What is still asked                         |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| `vit release`                              | Main menu                                                      | Bump type, changelog, message, confirmation |
| `vit release --bump patch`                 | Menu + bump type                                               | Changelog, message, confirmation            |
| `vit release --bump patch --message "fix"` | Menu + bump + message                                          | Changelog, confirmation                     |
| `vit release --bump patch --yes`           | Everything (full headless)                                     | Nothing                                     |
| `vit commit --yes`                         | Everything (uses default message)                              | Nothing                                     |
| `vit changelog --semantic --yes`           | Everything (uses commits per tag to regenerate full changelog) | Nothing                                     |
| `vit rollback --tag v1.2.3`                | Menu + tag selector                                            | Confirmation                                |
| `vit rollback --tag v1.2.3 --yes`          | Everything (full headless)                                     | Nothing                                     |

> **Note:** `--yes` only activates full headless mode when combined with a command. Without `--yes`, each argument skips its own prompt but the rest of the flow remains interactive.

### Examples

```bash
# Interactive release from the menu
vit

# Release skipping the menu, asks the rest
vit release

# Release with fixed bump, still asks for changelog and confirmation
vit release --bump minor

# Fully automated release (headless)
vit release --bump patch --yes

# Automated commit with default message
vit commit --yes

# Automated commit with custom message
vit commit --message "fix: typo" --yes

# Rollback to a specific tag without confirmation
vit rollback --tag v1.2.3 --yes

# Simulate a release without writing anything
vit release --bump patch --dry-run

# Release in monorepo for backend only
vit release --bump patch --projects backend --yes
```

---

## Configuration — `vit-config.json`

Create a `vit-config.json` file at the root of your project:

```json
{
  "changelog": {
    "path": "./CHANGELOG.md",
    "title": "Changelog",
    "semantic": false
  },
  "git": {
    "defaultCommitMessage": "chore: update",
    "releaseCommitMessage": "chore: release",
    "changelogCommitMessage": "docs: update changelog",
    "releaseBranches": ["main"],
    "strict": false,
    "rollbackStrategy": "revert"
  },
  "vcs": {
    "provider": "git"
  },
  "projects": [
    {
      "id": "core",
      "label": "Core",
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

**Headless mode** — the changelog is silently regenerated without prompts.

```json
"changelog": {
  "path": "./CHANGELOG.md",
  "title": "Changelog",
  "semantic": true
}
```

### `git`

| Field                    | Type       | Default                  | Description                                                |
| ------------------------ | ---------- | ------------------------ | ---------------------------------------------------------- |
| `defaultCommitMessage`   | `string`   | `chore: update`          | Default message for commits without bump                   |
| `releaseCommitMessage`   | `string`   | `chore: version bump`    | Default message for release commits                        |
| `changelogCommitMessage` | `string`   | `docs: update changelog` | Default message for changelog commits                      |
| `releaseBranches`        | `string[]` | `[]`                     | Branches from which releases are allowed                   |
| `strict`                 | `boolean`  | `false`                  | If `true`, blocks the release when on a non-allowed branch |
| `rollbackStrategy`       | `string`   | `"revert"`               | Rollback strategy: `"revert"` (default) or `"reset"`       |

#### Branch control for releases

You can restrict which branches can run a release using `releaseBranches` and `strict`.

**Warning mode** (`strict: false`, default)

If you are on a non-allowed branch, VIT shows a warning and asks if you want to continue anyway:

```
  WARNING   You are on branch "feat/my-feature", not on a release branch.
  Configured release branches: main

? Continue anyway? (y/N)
```

With `--yes` or in headless mode, the warning is automatically accepted and the release continues.

**Strict mode** (`strict: true`)

If you are on a non-allowed branch, the release is blocked and VIT exits with an error:

```
  BLOCKED   Releases are not allowed from branch "feat/my-feature".
  Allowed branches: main
```

In `--dry-run` mode, strict blocking is ignored to allow simulations from any branch.

**Example with multiple allowed branches:**

```json
"git": {
  "releaseBranches": ["main", "release", "hotfix"],
  "strict": true
}
```

#### Rollback strategy

`rollbackStrategy` controls how VIT undoes changes when rolling back to a previous tag.

Before executing any action, VIT always shows a **preview of the affected commits** along with the active strategy:

```
  Commits that will be rolled back:  (strategy: revert)
  ─────────────────────────────────────────────────────
  · feat: new login screen
  · fix: fix bug in the form
  · chore: release v1.1.0

  Strategy  : revert — creates a new commit, history preserved
  Target tag: v1.0.0 (3 commit(s) affected)
```

**`"revert"` (default)** — creates a new commit that undoes the changes. The git history remains intact and a normal push without `--force` is possible. Recommended for shared repos with other collaborators.

**`"reset"`** — moves the HEAD pointer to the target tag, rewriting history. Requires force push (`git push --force`). Use only on personal repos or your own branches.

```json
"git": {
  "rollbackStrategy": "revert"
}
```

> **Note:** With the `reset` strategy, VIT also offers to delete the tags that were above the target tag, since they would point to commits that no longer exist in the local history.

### `vcs`

| Field      | Type     | Default | Description                              |
| ---------- | -------- | ------- | ---------------------------------------- |
| `provider` | `string` | `git`   | VCS provider. Currently supported: `git` |

### `projects`

Array of projects to manage. Useful for monorepos.

| Field       | Type     | Description                                                  |
| ----------- | -------- | ------------------------------------------------------------ |
| `id`        | `string` | Unique project identifier                                    |
| `label`     | `string` | Human-readable project name                                  |
| `path`      | `string` | Relative path to the project directory                       |
| `tagPrefix` | `string` | Prefix for git tags (`v` → `v1.2.3`, `vback` → `vback1.2.3`) |

**Monorepo example:**

```json
"projects": [
  { "id": "backend",  "label": "Backend",  "path": "./Backend",  "tagPrefix": "vback" },
  { "id": "frontend", "label": "Frontend", "path": "./Frontend", "tagPrefix": "vfront" }
]
```

### `types` (optional)

Customize the commit types available in the changelog. They are merged with the default types.

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

Path to a global `.env` file whose variables will be available in **all** actions. Variables from the file have lower priority than `env` and `promptEnv` defined in each action.

```json
{
  "envFile": ".env"
}
```

See [Environment variables and `envFile`](#environment-variables-and-envfile) for more details.

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
| `on`              | `string[]` | `["release"]` | Triggers: `release`, `commit`, `changelog`                                       |
| `cwd`             | `string`   | `.`           | Working directory for the command                                                |
| `continueOnError` | `boolean`  | `false`       | If `true`, an error doesn't stop execution                                       |
| `showOutput`      | `boolean`  | `true`        | Show stdout/stderr in real time                                                  |
| `timeoutMs`       | `number`   | `null`        | Timeout in ms. `null` = no limit                                                 |
| `envFile`         | `string`   | `null`        | Path to a `.env` specific to this action (higher priority than global `envFile`) |
| `env`             | `object`   | `{}`          | Static environment variables (higher priority than `envFile`)                    |
| `promptEnv`       | `array`    | `[]`          | Variables asked interactively to the user (highest priority)                     |
| `pipeline`        | `array`    | `[]`          | Previous steps that enrich the command's environment                             |
| `command`         | `string`   | —             | Main command to execute                                                          |

### Available triggers

| Trigger     | When it runs                 |
| ----------- | ---------------------------- |
| `release`   | When bumping the version     |
| `commit`    | When committing without bump |
| `changelog` | When committing a changelog  |

### `promptEnv`

Allows asking for sensitive values (passwords, tokens) right before running the action, without storing them anywhere.

```json
"promptEnv": [
  { "name": "SSH_PASS",     "message": "SSH password:" },
  { "name": "DEPLOY_TOKEN", "message": "Deploy token:" }
]
```

> **Note:** `promptEnv` has the highest priority in VIT. This means that even when running VIT in headless mode, the process will stop until it receives user input.

---

## Environment variables and `envFile`

VIT supports loading environment variables from `.env` files at two levels: **global** (for all actions) and **per action** (only for that action). Variables at the closer level take priority.

### Priority order (lower → higher)

```
process.env  →  global envFile  →  action envFile  →  action.env  →  promptEnv
```

### Global `envFile`

Defined at the root of `vit-config.json`. Its variables are available in all actions.

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

### Full example

**`vit-config.json`:**

```json
{
  "envFile": ".env",
  "postActions": [
    {
      "id": "deploy",
      "label": "Deploy to production",
      "on": ["release"],
      "envFile": ".env.production",
      "command": "echo Deploying as ${DEPLOY_USER} in ${APP_ENV}"
    }
  ]
}
```

**`.env`** (available for all actions):

```env
APP_ENV=development
DEPLOY_USER=dev
```

**`.env.production`** (only for the `deploy` action, overrides `.env`):

```env
APP_ENV=production
DEPLOY_USER=deploy-bot
```

In the `deploy` action, `APP_ENV` will be `production` and `DEPLOY_USER` will be `deploy-bot` because `.env.production` has priority over `.env`.

> **Note:** `.env` files are parsed internally without needing to install `dotenv`. Comments (`# comment`), blank lines and values with single or double quotes are supported.

---

## Step pipeline

The `pipeline` of an action is a list of commands that run **before** the main `command`. Each step can capture its stdout as an environment variable available to subsequent steps and to the final `command` via `${VAR}` interpolation.

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

> **Note:** Pipeline steps have `showOutput: false` by default because their purpose is to capture values. The main `command` of the action has `showOutput: true` by default.

---

## Pipeline vs. multiple actions

This is the most important distinction when designing your configuration.

### Pipeline — steps inside an action

- All steps **share the same accumulated environment**: what step 1 captures can be used by step 3 and the final `command`.
- They run in series within the same action.
- Their purpose is to **prepare dynamic data** to build the main command.
- They have no `on`, `promptEnv` or `env` of their own — they inherit everything from the parent action.

### Multiple actions — independent tasks

- Each action has its own `on`, `cwd`, `env`, `envFile`, `promptEnv`, `showOutput` and `timeoutMs`.
- Each one appears as a separate block with its own spinner and label in the UI.
- **They do not share variables** between them.
- They are conceptually distinct tasks: tests, build, deploy, notification…

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

Captures the version from `package.json` at runtime to correctly label the Docker image.

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

Combines `pipeline` to build the destination path and `promptEnv` to ask for the SSH password without storing it anywhere.

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

### Deploy with environment variables from file

Uses `envFile` per action to load production credentials without exposing them in the config.

```json
{
  "id": "deploy-production",
  "label": "Deploy to production",
  "on": ["release"],
  "showOutput": true,
  "envFile": ".env.production",
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    }
  ],
  "command": "scp -r ./dist ${DEPLOY_USER}@${SERVER_HOST}:/var/www/releases/${VERSION}"
}
```

**`.env.production`:**

```env
DEPLOY_USER=deploy-bot
SERVER_HOST=production.myserver.com
```

---

### Publish to npm only if the version doesn't exist yet

Checks if the version is already published before running `npm publish`, avoiding errors in CI pipelines.

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

Sends a message to a Slack channel with the published version, branch and date, using only `curl`.

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

Full configuration example for a monorepo with backend and frontend.

```json
{
  "git": {
    "strict": true,
    "releaseBranches": ["main"]
  },
  "envFile": ".env",
  "projects": [
    {
      "id": "backend",
      "label": "Backend",
      "path": "./Backend",
      "tagPrefix": "vback"
    },
    {
      "id": "frontend",
      "label": "Frontend",
      "path": "./Frontend",
      "tagPrefix": "vfront"
    }
  ],
  "preActions": [
    {
      "id": "test-backend",
      "label": "Backend tests",
      "on": ["release"],
      "cwd": "./Backend",
      "continueOnError": false,
      "showOutput": true,
      "command": "npm test"
    },
    {
      "id": "build-frontend",
      "label": "Frontend build",
      "on": ["release"],
      "cwd": "./Frontend",
      "continueOnError": false,
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
    },
    {
      "id": "summary",
      "label": "Release summary",
      "on": ["release"],
      "continueOnError": true,
      "showOutput": false,
      "pipeline": [
        {
          "command": "node -e \"process.stdout.write(require('./Backend/package.json').version)\"",
          "captureAs": "BACK_VERSION"
        },
        {
          "command": "node -e \"process.stdout.write(require('./Frontend/package.json').version)\"",
          "captureAs": "FRONT_VERSION"
        },
        { "command": "git rev-parse --abbrev-ref HEAD", "captureAs": "BRANCH" },
        {
          "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,16).replace('T',' '))\"",
          "captureAs": "DATE"
        }
      ],
      "command": "node -e \"console.log('\\n  ✅ Release complete\\n  Backend  : v${BACK_VERSION}\\n  Frontend : v${FRONT_VERSION}\\n  Branch   : ${BRANCH}\\n  Date     : ${DATE}\\n')\""
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
