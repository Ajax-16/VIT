# Changelog

## [v-0.0.33] - 29/04/2026

### 🚀 Features

- update existing PR title and body when reusing it on promote


### 🐛 Bug fixes

- Making vit-vars usefull again


## [v-0.0.32] - 29/04/2026

### 🚀 Features

- interpolate ${VAR} placeholders across all config string values


### 🐛 Bug fixes

- reuse existing open PR instead of creating a duplicate on promote


## [v-0.0.31] - 29/04/2026

### 🚀 Features

- interpolate ${VAR} placeholders in config values using process.env

- Added merge strategy options in promotion (merge or pull request) | restore vit-config with github token interpolation

- promote strategy — merge (local) or pr (GitHub API)


### 🐛 Bug fixes

- load envFile before interpolating config values so ${VAR} placeholders resolve correctly


## [v-0.0.30] - 29/04/2026

### 🚀 Features

- semver prepatch/preminor/premajor flow + promote strips prerelease suffix

- add promote command + extract runChangelogStep


### 🐛 Bug fixes

- group prerelease tag commits under next stable tag in changelog

- isFirstPrerelease detection using string preId comparison

- Adapted vit-vars to be usable in all os | v-0.0.30-alpha.0


## [v-0.0.29] - 28/04/2026

### 🚀 Features

- Added pre-release type of release


### 🐛 Bug fixes

- Solved a bug that made last stable tags in changelog semantic generation to not be detected

- Prerelease version tag is now well displayed (ending in pre.0 for the first version instead of pre.1)

- Solved a bug that made the next version on prerelease to not be displayed correctly

- solved a bug in changelog creation process loop

- Solved an error that produced to semantic changelog generation on not headless mode to block vit


## [v-0.0.28] - 28/04/2026

### 🚀 Features

- Added vit-vars, a set of built-in env variables that you can use at anypoint of a vit-config.json file and reduces common used variables implementation complexity


## [v-0.0.26] - 28/04/2026

### 📚 Documentation

- update changelog

- translate README to English


## [v-0.0.25] - 27/04/2026

### 🚀 Features

- Added --semantic flag to use semantic mode on changelog without having to change vit-config.json

- implement 4 changelog modes (semantic x headless matrix)


### 🐛 Bug fixes

- MODE 3 without pendingTag returns { saved: false } instead of falling back to interactive prompts

- connect runChangelog in index.js and fix MODE 3 test


## [v-0.0.24] - 27/04/2026

### 🐛 Bug fixes

- remove redundant extensionsToTreatAsEsm (.js inferred from type:module)

- use cross-platform jest invocation for Windows compatibility


### 📚 Documentation

- add semantic changelog and rollbackStrategy documentation


## [v-0.0.23] - 27/04/2026

### 🚀 Features

- *(rollback)* revert strategy by default, reset via config + commit preview


## [v-0.0.22] - 27/04/2026

### 🐛 Bug fixes

- specified dry-run on changelog summary operation when dry run was not selected

- test


### 📚 Documentation

- update changelog


## [v-0.0.21] - 27/04/2026

### 🐛 Bug fixes

- Solved an error that produced semantic mode not to work | v-0.0.21


## [v-0.0.20] - 27/04/2026

### 🐛 Bug fixes

- *(semantic-changelog)* include unreleased commits when building changelog during release


### 📚 Documentation

- update changelog


## [v-0.0.19] - 27/04/2026

### 🚀 Features

- semantic changelog regenerates full history from all git tags

- wire buildSemanticChangelog into index.js changelog flow

- add semantic changelog support based on conventional commits


### 🐛 Bug fixes

- skip path prompt when changelog.path is already configured


### 🚜 Refactoring

- resolve changelog path directly from config, remove prompt

- semantic changelog as a structural mode, not a menu option


### 📚 Documentation

- update changelog


## [v-0.0.18] - 27/04/2026

### 🐛 Bug fixes

- Translated rollback error message on none adapter to english | v-0.0.18


## [v-0.0.17] - 27/04/2026

### 📚 Documentation

- document releaseBranches and strict git config

- add CLI arguments section


## [v-0.0.16] - 26/04/2026

### 🚀 Features

- headless execution | v-0.0.16

- headless execution

- *(cli)* add CLI argument parser and headless execution mode


### 🐛 Bug fixes

- *(cli)* use default commit message when --yes is set without --message

- *(cli)* skip menu and answered prompts when args provided without --yes


## [v-0.0.15] - 26/04/2026

### 🚀 Features

- *(dry-run)* add --dry-run mode, remove simulate


## [v-0.0.14] - 26/04/2026

### 🚀 Features

- *(branch-guard)* releaseBranches config with warn and strict modes

- *(simulate)* preflight simulation mode configurable from vit-config


## [v-0.0.13] - 26/04/2026

### 🐛 Bug fixes

- *(actions)* enrich thrown errors with action context (id, label, section)

- *(actions)* pass parentCwd to pipeline steps; warn on actions missing command

- *(pipeline)* pipeline steps inherit parent action cwd


## [v-0.0.12] - 26/04/2026

### 📚 Documentation

- add envFile support to README


## [v-0.0.10] - 26/04/2026

### 📚 Documentation

- expand README with advanced pipeline examples and actions vs pipeline comparison

- complete README documentation


## [v-0.0.8] - 26/04/2026

### 🐛 Bug fixes

- clean error output with log file


## [v-0.0.6] - 26/04/2026

### 🚀 Features

- add preActions, postActions pipeline with captureAs support


### 📚 Documentation

- update changelog


## [core-0.0.4] - 26/04/2026

### 🚀 Features

- postActions | core-0.0.4

- postActions | core-0.0.5

- postActions | core-0.0.4


## [core-0.0.3] - 26/04/2026

### 🚀 Features

- Idioma cambiado a inglés | core-0.0.3


