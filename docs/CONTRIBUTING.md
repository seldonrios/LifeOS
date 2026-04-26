# Contributing

This is the canonical contributor guide for LifeOS.

## Contribution Intake

- Report bugs with [Bug report issue form](../.github/ISSUE_TEMPLATE/bug_report.yml)
- Propose features with [Feature request issue form](../.github/ISSUE_TEMPLATE/feature_request.yml)
- Report docs gaps with [Documentation issue form](../.github/ISSUE_TEMPLATE/docs_issue.yml)
- Review maintainer expectations in [Maintainer Policy](community/maintainer-policy.md)
- Follow release versioning and tagging in [Release Policy](community/release-policy.md)
- Follow test expectations in [Test Taxonomy](testing/test-taxonomy.md)
- Follow ecosystem compatibility requirements in [Works with LifeOS Checklist](community/works-with-lifeos-checklist.md)

## Folder Conventions and Navigation

| I want to...                             | Go to...                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Understand the system                    | `docs/architecture/overview.md`                                  |
| Add a new AI domain capability           | `modules/` + `pnpm lifeos module create <name>` → see [Module Authoring Guide](community/module-authoring-guide.md) |
| Add a new core subsystem                 | `packages/` + `pnpm run scaffold` (select TS or Python package)  |
| Change how events work                   | `packages/event-bus/`                                            |
| Change the life graph data model         | `packages/life-graph/`                                           |
| Add a new Docker service                 | `services/` + `docker-compose.yml`                               |
| Understand startup health/degraded state | `packages/module-loader/src/diagnostics.ts` + module-loader logs |
| Understand a design decision             | `docs/adr/`                                                      |

## Naming Standards

- Packages use kebab-case (example: `goal-engine`, `agent-mesh`)
- Module schemas use namespaced event names (example: `fitness.workout.completed`)
- Commit messages use Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`) and are enforced by `commitlint.config.js`

## How to Add a New Package

1. Run `pnpm run scaffold`, then select either `(1) TypeScript package` or `(2) Python package`.
2. Enter a kebab-case package name and a clear description.
3. If you selected `(1) TypeScript package`, implement `src/index.ts` and `src/types.ts`.
4. If you selected `(2) Python package`, implement `src/<name>/__init__.py` and `src/<name>/types.py`, then update dependencies in `pyproject.toml` as needed.
5. Run `pnpm run validate` and ensure it passes before opening a PR. The validation pipeline runs in this exact order: `build:modules -> typecheck -> lint -> format:check -> test`. Module compilation failures at the first step block all downstream checks.

## How to Add a New Light Module

1. Run `pnpm lifeos module create <name>` — this generates `modules/<name>/lifeos.json` and `modules/<name>/src/index.ts` using `@lifeos/module-sdk`.
2. Edit `lifeos.json` — fill in the current manifest fields used by the scaffold and validator: `name`, `version`, `author`, `description`, `permissions`, `resources`, `requires`, `category`, `tags`, and optional `subFeatures`. Use bounded semver ranges for package requirements in `requires` entries (for example `@lifeos/module-sdk@>=0.1.0 <0.2.0`).
3. Implement `src/index.ts` — export a default object conforming to the `LifeOSModule` interface from `@lifeos/module-sdk`.
4. Run `pnpm lifeos module validate <name>` — validates `lifeos.json` schema and semver ranges.
5. Run `pnpm run validate` — runs the full pipeline (`build:modules -> typecheck -> lint -> format:check -> test`).

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
- Automation can skip pre-commit hooks by setting `LIFEOS_GIT_AUTOMATION=1` (legacy alias `TRAYCER_GIT_AUTOMATION=1` remains accepted for one cycle).

## Test Contract

- Every package that contains `.test.ts` files must define a `"test"` script in its `package.json`. The specific test command (e.g., `tsx --test`, `vitest run`) is package-owned.
- Tests are executed as part of `pnpm run validate` through the root `test` script, which invokes `tsx scripts/test-runner.ts`. The runner first enforces that every package with `.test.ts` files declares a `"test"` script in its `package.json` — any violation causes an immediate non-zero exit before tests run. If enforcement passes, the runner executes `pnpm -r --filter ./packages/* run --if-present test` to invoke each package's test script in turn.
- `pnpm run validate` fails if any test fails; there is no warn-only mode.
- New TypeScript packages generated with `pnpm run scaffold` include the test script automatically; no manual step is required.
- Run tests for a single package in isolation with `pnpm --filter @lifeos/<name> run test`.

## Commit Message Format

```text
<type>(<scope>): <description>

Types: feat | fix | docs | chore | refactor | test | ci
```

Examples:

- `feat(reasoning): add intent classification stub`
- `docs(life-graph): update entity type list`
- `chore(root): configure husky pre-commit hook`

## Release Integrity Check (Before Push)

Run these commands before pushing:

```powershell
git show --name-only HEAD
git status -sb
```

Required checks:

- `git show --name-only HEAD` must include the expected runtime files for your change (for Life Graph runtime/client work, ensure both `packages/life-graph/src/manager.ts` and `packages/life-graph/src/index.ts` are listed).
- `git status -sb` must be clean before push.

## Release Categories

- `patch`: fixes, docs corrections, and internal hardening without behavior breaks
- `minor`: additive stable capability changes
- `major`: breaking behavior or interface changes
