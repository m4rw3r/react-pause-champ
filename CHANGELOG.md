# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2025-06-20

### Fixed

- Peer-dependency format

## [1.0.0] - 2024-12-09

### Added

- Support for React 19.
- Test-cases for React Pause Champ now test multiple React versions, currently
  both 18 and 19.

### Fixed

- Prefix for data managed by `createSharedState` no longer collide with
  `createPersistentState`.

## [0.2.5] - 2024-02-25

### Fixed

- `createSharedState` and `createPersistentState` now correctly updates the
  data internally.
- `package.json` exports now properly use relative paths.

## [0.2.4] - 2024-02-23

### Changed

- Improved exports in `internal` export.

## [0.2.3] - 2024-02-23

### Added

- Typescript types exports.

## [0.2.2] - 2024-02-23

### Added

- `README.md` to published package.

## [0.2.1] - 2024-02-23

### Added

- Exports of some internals to make it easier to build Suspense-compatible
  state in other libraries.

## [0.2.0] - 2024-02-23

### Changed

- Major refactor.
