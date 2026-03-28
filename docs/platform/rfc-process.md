# Platform RFC Process

This process governs platform-level contract changes.

## Changes that require an RFC

An RFC is required for any proposed change to:

- Module manifest schema fields used by `lifeos.json` validation
- `Topics.lifeos.*` event names or their semantic meaning
- `LifeGraphDocument` schema (including sub-schemas)
- `LifeOSModule` or `ModuleRuntimeContext` public interfaces
- Public SDK API surface (mobile SDK and module SDK)

## RFC lifecycle

1. Draft RFC in `docs/platform/rfcs/` (or PR attachment for early phases).
2. Request review from listed platform owners.
3. Mark impact level: `breaking`, `additive`, or `internal`.
4. Land migration and rollout plan before merge.
5. Ship with release notes and compatibility notes.

## RFC template

Use the following template.

```md
# RFC: <title>

## Problem statement
What is broken, missing, or inconsistent today?

## Proposal
What changes are being introduced?

## Alternatives considered
What options were rejected and why?

## Migration path
How existing users/modules move safely.

## Rollout plan
Phasing, flags, timeline, and success criteria.
```
