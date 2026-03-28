# Compatibility Matrix

This document describes the CI-generated compatibility matrix artifact.

## Source of truth

- Workflow: `.github/workflows/compatibility-matrix.yml`
- Artifact: `compatibility-matrix.json`

## What is validated

1. `pnpm lifeos module validate <module>` runs for every module in `modules/`.
2. Each `lifeos.json` `requires` range is checked against current CLI version.
3. A human-readable JSON matrix artifact is uploaded by CI.

## Matrix JSON shape

- `generatedAt`: ISO timestamp
- `cliVersion`: current CLI version used for checks
- `modules[]`:
  - `module`
  - `manifestPath`
  - `requires[]`
  - `rangeChecks[]` with `entry`, `cliVersion`, `compatible`
  - `compatible` (overall)
