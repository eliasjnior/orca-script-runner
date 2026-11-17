# Changelog

Notable changes to Scripts, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-11-04

### Changed

- Scripts moved from `eliasjnior/orca-plugins` into its own repository and installs from Orca's
  plugin directory.

## 1.1.2 - 2026-11-04

### Changed

- Released with Notes 1.1.2, whose bundled font kept Orca's plugin directory from listing either
  plugin. The panel is unchanged.

## 1.1.1 - 2026-11-03

### Fixed

- The cover keeps the plugin's name and tagline visible on Orca's plugin page.

## 1.1.0 - 2026-11-03

### Added

- Icon, cover and screenshot for Orca's plugin directory.

### Changed

- A shorter description, so the directory's cards no longer cut it.

## 1.0.0 - 2026-11-03

### Added

- A Scripts panel in the right sidebar that lists every entry under `scripts:` in the focused
  worktree's `orca.yaml` with a Run button. Run opens a terminal tab and runs the script the way
  Orca runs setup: Bash with `set -e`, from the worktree, with the `ORCA_*` variables.
- Run on `setup` or `archive` asks first, inside the script's card.

Versions up to 1.1.2 were released from `eliasjnior/orca-plugins`, which has since been deleted.

[Unreleased]: https://github.com/eliasjnior/orca-script-runner/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/eliasjnior/orca-script-runner/releases/tag/v1.2.0
