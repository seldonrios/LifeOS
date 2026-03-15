# ADR-003: ESLint, Prettier, and Ruff Toolchain

## Status

Accepted

## Context

The monorepo needs consistent formatting and linting across TypeScript and Python files, enforced in CI and at commit time.

## Decision

Use ESLint flat config (`eslint.config.ts`) for TypeScript linting, Prettier for TypeScript/JSON/YAML/Markdown formatting, and Ruff for Python linting and formatting. All three are wired into `pnpm run validate` and `lint-staged` in `package.json`.

## Consequences

- Three tools must be configured and maintained.
- Contributors need both Node.js and Python toolchains.
- Commit-time auto-fix reduces friction for common formatting/lint issues.

## Alternatives Considered

- Biome: does not cover Python.
- TSLint: deprecated.
- Black and Flake8: two-tool Python setup versus Ruff's single-tool approach.
- No formatter: leads to inconsistent diffs and avoidable style churn.
