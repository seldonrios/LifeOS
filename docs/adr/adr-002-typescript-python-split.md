# ADR-002: TypeScript and Python Responsibility Split

## Status

Accepted

## Context

LifeOS services and packages are TypeScript-first, but AI and simulation layers benefit from Python's ecosystem.

## Decision

Use TypeScript for services, packages, and modules. Use Python for AI inference layers and simulation packages. The split is enforced by the scaffold tool (which prompts for package type) and by `ruff.toml` and `eslint.config.ts` covering their respective file types.

## Consequences

- The Dev Container and CI require a dual-language toolchain.
- `pnpm run validate` runs both ESLint for TypeScript and Ruff for Python.
- Contributors must have both runtimes available.

## Alternatives Considered

- TypeScript-only: limits access to mature AI/ML Python ecosystem tooling.
- Python-only: loses TypeScript's strong type safety in service and package layers.
- Go for services: unfamiliar to many contributors and not aligned with existing ecosystem choices.
