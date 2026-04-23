# Phase 6 Closeout

## What changed

- Standardized first-party module metadata in `packages/core/src/module-catalog.ts`.
- Refactored the CLI to consume centralized module metadata and bindings instead of scattered constants and ad hoc alias handling.
- Normalized the health module to the real manifest/runtime id `health-tracker` while preserving `health` as a compatibility alias.
- Expanded module list/status output to show `baseline`, `optional`, and `system` tiers plus alias/shared-implementation notes.
- Replaced the hand-maintained first-party manifest validation list in CI with a registry-driven validator script.
- Corrected architecture/setup/authoring docs to state that `lifeos.json` is the only current MVP manifest artifact.

## What is now authoritative

- `lifeos.json` is the single current MVP manifest artifact.
- `@lifeos/module-sdk` is the current authoring/runtime SDK surface.
- `packages/core/src/module-catalog.ts` is the authoritative first-party module catalog for canonical ids, tiers, aliases, manifest directories, visibility, toggleability, and implementation bindings.
- `packages/cli/src/first-party-module-registry.ts` is the accepted MVP runtime composition layer that binds catalog entries to first-party implementations.

## Accepted MVP debt

- The CLI still composes first-party modules centrally instead of performing dynamic discovery.
- `personality` and `briefing` remain separate user-facing baseline entries backed by the same orchestrator implementation.
- Hidden system modules such as `home-state` and `voice` remain managed through dedicated surface/runtime flows rather than `lifeos module enable/disable`.

## Why this was the right Phase 3 choice

- It removes the misleading two-manifest story without inventing a future platform architecture.
- It keeps current MVP behavior intact while making module coupling explicit and reviewable.
- It fixes the most visible inconsistency (`health` vs `health-tracker`) through normalization and compatibility instead of deletion.
- It gives CI and docs one concrete source of truth for the first-party module surface.