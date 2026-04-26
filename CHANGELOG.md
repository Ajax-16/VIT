# Changelog

## [0.0.10] - 26/04/2026

### 🚀 Features

- Now you can enter a .env file globally or in a given action to use it.

# Changelog

## [0.0.9] - 26/04/2026

### 🚀 Features

- Added new error control with reduced data on screen and a tmp log that generates with all the stack trace.

## [0.0.7] - 26/04/2026

### 🚀 Features

- Added version display on entry

# Changelog

## [0.0.5] - 26/04/2026

### 🚀 Features

- preActions and postActions and pipelines added

# Registro de cambios

# Registro de cambios

## [0.0.4] - 26/04/2026

### 🚀 Features

- New postActions feature! Run any script or apps in specific vit actions

# Changelog

## [0.0.3] - 26/04/2026

### 🎨 Styles

- _(Language)_ CLI language changed to English for broader accessibility.

## [0.0.2] - 25/04/2026

### 🐛 Bug fixes

- Updated README.md

## [0.0.1] - 25/04/2026

> First public release of VIT - Version It! A smart CLI for npm project versioning.

### 🚀 Features

- npm versioning system with `patch`, `minor` and `major` bumps

- Configuration via `vit-config.json`

- Support for one or multiple configurable projects

- Interactive changelog generation and editing

- Configurable tag system per project via `tagPrefix`

- Configurable VCS integration

- Support for `git` and `none` mode without a repository

- Automatic commit, tag and push when the VCS provider allows it

- CLI rollback to tags when the VCS provider supports it

### ⚡ Performance

- Uses native `child_process` to run versioning and VCS operations

- Simple and direct project resolution from `process.cwd()`

### 🎨 Styles

- Colored CLI interface with `chalk`

- Status spinners with `ora`

- Interactive prompts with `inquirer`

- Clear summaries before executing operations
