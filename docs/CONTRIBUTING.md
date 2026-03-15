# Contributing

This is the canonical contributor guide for LifeOS.

## Folder Conventions and Navigation

| I want to... | Go to... |
|---|---|
| Understand the system | `docs/architecture/overview.md` |
| Add a new AI domain capability | `modules/` + `pnpm run scaffold` (select Light AI module) |
| Add a new core subsystem | `packages/` + `pnpm run scaffold` (select TS or Python package) |
| Change how events work | `packages/event-bus/` |
| Change the life graph data model | `packages/life-graph/` |
| Add a new Docker service | `services/` + `docker-compose.yml` |
| Understand startup health/degraded state | `packages/module-loader/src/diagnostics.ts` + module-loader logs |
| Understand a design decision | `docs/adr/` |

## Naming Standards

- Packages use kebab-case (example: `goal-engine`, `agent-mesh`)
- Module schemas use namespaced event names (example: `fitness.workout.completed`)
- Commit messages use Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`) and are enforced by `commitlint.config.js`

## How to Add a New Package

1. Run `pnpm run scaffold`, then select either `(1) TypeScript package` or `(2) Python package`.
2. Enter a kebab-case package name and a clear description.
3. If you selected `(1) TypeScript package`, implement `src/index.ts` and `src/types.ts`.
4. If you selected `(2) Python package`, implement `src/<name>/__init__.py` and `src/<name>/types.py`, then update dependencies in `pyproject.toml` as needed.
5. Run `pnpm run validate` and ensure it passes before opening a PR.

## How to Add a New Light Module

1. Run `pnpm run scaffold`, then select `(3) Light AI module`.
2. Fill `manifest.ts` with provides/requires/optional/hardware/degraded mode details.
3. Fill `events.ts` with at least one subscription or emission stub.
4. Fill `agent.ts` with the module agent role definition.
5. Run `pnpm run validate`.

## How to Add a New Docker Service

1. Create `services/<name>/` with a thin `src/index.ts` wrapper.
2. Use the `packages/service-runtime` startup chain: config -> secrets -> observability -> auth/policy -> routes -> health/readiness -> listen.
3. Add the service entry to `docker-compose.yml` with `depends_on: init-db: condition: service_completed_successfully`.
4. Add a `Dockerfile` for the service.

## Pre-Commit Hook Behavior

- Husky runs `lint-staged` on staged files.
- Auto-fixers run for Prettier formatting, ESLint auto-fixable rules, and Ruff formatting.
- Commits are blocked only for unfixable errors (for example type violations or undefined references).
- Commit message format is validated by Commitlint against Conventional Commits.

## Commit Message Format

```text
<type>(<scope>): <description>

Types: feat | fix | docs | chore | refactor | test | ci
```

Examples:

- `feat(reasoning): add intent classification stub`
- `docs(life-graph): update entity type list`
- `chore(root): configure husky pre-commit hook`
