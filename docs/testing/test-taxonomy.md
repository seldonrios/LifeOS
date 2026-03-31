# Test Taxonomy

This document defines the minimum test class expected for each change type.

## Test Classes

- `unit`: isolated behavior in one package, no external services
- `integration`: cross-package flow with runtime adapters mocked or local-only
- `smoke`: non-interactive CLI journey checks for install and first-run confidence
- `e2e` (optional): full stack (`docker compose --profile dormant up`) path validation

## Change-Type Mapping

- Runtime logic changes in a package:
  - required: `unit`
  - recommended: `integration` when crossing package boundaries
- CLI command or output changes:
  - required: `unit` (command tests) + `smoke`
- Setup, workflow, and docs process changes:
  - required: `smoke` updates if command sequence changes
- Service or multi-node behavior changes:
  - required: `integration`
  - optional: `e2e` for full-stack confidence

## Canonical Commands

- Full gate: `pnpm run validate`
- Package-only test: `pnpm --filter @lifeos/<name> run test`
- Smoke journey: `pnpm lifeos --version`, `pnpm lifeos status --json --graph-path ./.tmp/lifeos-smoke/life-graph.json`, `pnpm lifeos demo --dry-run --goal "Smoke test goal" --graph-path ./.tmp/lifeos-smoke/life-graph.json`
- `CLI Smoke` runs those direct commands on Ubuntu and Windows.

## Required PR Notes

When opening a PR, explicitly note:

- which test class(es) were updated (`unit`, `integration`, `smoke`, `e2e`)
- why skipped classes are not needed for this change

## Household-specific test requirements

- Any change touching `modules/household-*` requires a multi-user integration test.
- Voice capture changes require running `test:voice-capture`.
- Any PR touching more than one household module must pass `test:household-mvp`.
