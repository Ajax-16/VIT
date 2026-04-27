# Changelog

## [v-0.0.25] - 27/04/2026

### 🚀 Features

- Added --semantic flag to use semantic mode on changelog without having to change vit-config.json

- implement 4 changelog modes (semantic x headless matrix)


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


