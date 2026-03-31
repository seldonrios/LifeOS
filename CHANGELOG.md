# Changelog

All notable changes to LifeOS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 5 household coordination rollout baseline across household identity, chores, shopping, calendar, capture-router, and home-state packages.
- Mesh protocol and marketplace trust contracts for Phase 3 foundation.
- `lifeos mesh debug --bundle` command for reproducible mesh diagnostics.
- Works with LifeOS checklist, external module CI example, and dedicated workflow profile.

### Changed

- Completed two-wave stable dependency upgrade across root toolchain, CLI/runtime packages, and desktop stack (TypeScript 6, ESLint 10, Vitest 4, Vite 8, React test tooling alignment).
- Raised minimum supported Node.js to `>=20.19.0` for local development and CI/runtime compatibility with upgraded bundler/test dependencies.
- Upgraded GitHub Actions to Node 24-compatible major versions and pinned workflow execution Node to `20.19.0` for deterministic cross-platform validation.
- CI and release versioning workflows now install Ruff and validate before release version PR updates.
- CLI smoke workflow now executes real non-interactive CLI commands (`--version`, `status --json`, `demo --dry-run`).
- Root `pnpm lifeos` command now runs in `@lifeos/cli` package scope to resolve workspace dependencies consistently.
- Pre-commit automation env var standardized to `LIFEOS_GIT_AUTOMATION` (legacy alias retained).
- Mesh delegation now propagates `traceId` through events and RPC payloads for cross-node correlation.

## [0.3.0] - 2026-03-26

### Added

- GitHub issue forms for bug, feature, and documentation intake with explicit trust/reporting links.
- Maintainer policy, release policy, and test taxonomy documentation for contributor and operator clarity.
- Changesets release versioning flow, changelog maintenance baseline, and tag-driven GitHub release workflow.
- Cross-platform CLI smoke workflow to validate first-run non-interactive commands on Linux and Windows.

### Changed

- README and setup guidance now emphasize recommended vs advanced onboarding paths and Phase 2 productization goals.
- Contributor guidance now links canonical intake, governance, release, and testing contracts.

## [0.2.1] - 2026-03-26

### Changed

- Hardened sovereignty defaults with stricter fail-closed policy, security, and observability behavior.
- Expanded trust transparency with CLI trust surfaces and desktop trust center visibility.

## [0.2.0] - 2026-03-20

### Added

- Voice-first runtime with wake-word flow and proactive daily briefing support.
- Persistent memory and multi-device local sync foundations.
- Expanded optional modules including research, notes, weather, and news.
