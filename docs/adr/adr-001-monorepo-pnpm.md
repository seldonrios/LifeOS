# ADR-001: Monorepo with pnpm Workspaces

## Status

Accepted

## Context

LifeOS has 18 packages, 6 modules, and 16 services that share types, tooling, and scripts. A single-repo approach is needed to enforce consistent quality gates and enable cross-package type checking.

## Decision

Use pnpm workspaces as the monorepo manager, with workspace globs covering `packages/*`, `packages/modules/*`, `services/*`, and `scripts/*`. pnpm is pinned to version 9.15.4 in `package.json`.

Light modules under `modules/` are intentionally scaffolded as module folders, not as pnpm workspace packages.

## Consequences

- All packages share a single `node_modules` hoisting strategy.
- `pnpm-workspace.yaml` is the single source of workspace membership.
- `tsconfig.packages.json` enables project references across TypeScript packages.

## Alternatives Considered

- npm workspaces: slower installs and no strict hoisting behavior.
- Yarn Berry: Plug'n'Play mode adds contributor complexity.
- Nx or Turborepo: additional abstraction layer not needed at Phase 1 scale.
- Separate repositories: breaks shared type system and consistent quality gates.
