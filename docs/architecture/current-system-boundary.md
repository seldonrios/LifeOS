# Current System Boundary (Phase 3 Baseline)

> **Status: current architectural boundary for the active release target**
> This document is the canonical architecture baseline for Phase 3 review and contribution decisions.
> Product scope remains defined by [docs/product/current-product-contract.md](../product/current-product-contract.md).

## Purpose

Define the current, reviewable system boundary for LifeOS so contributors can distinguish:

- what is in the active MVP runtime shape now
- what is valid extended platform context but non-MVP by default

This boundary is binding for current architecture reviews.

## Active Release Boundary

Current release target: **Phase 3 - Personal Operations OS MVP + Daily-Use Validation**.

The primary runtime and review surface is the **CLI-first, local-first daily hero loop**.

## Two Valid System Shapes

### 1) Current MVP runtime shape (default)

- local-first single-node runtime
- CLI-first hero loop (capture -> triage -> plan -> reminders/next actions -> review)
- core runtime packages and module loader
- canonical local persistence (SQLite)
- optional local NATS and optional local Ollama

### 2) Extended/non-MVP platform shape (optional context)

- companion desktop/mobile/web surfaces
- optional extended platform stack services (including profile-gated Compose services)
- optional/future cross-node delegation and federation patterns
- optional/future larger service-stack data stores

This shape is architectural context and can be exercised for advanced scenarios, but it is not the default release obligation.

## System Boundary Diagram (Plain Text)

```text
Phase 3 Current System Boundary

  [1] CLI Hero Loop
      lifeos capture/inbox/plan/remind/review
                |
                v
  [2] Core Runtime Packages
      cli, goal-engine, orchestrator, personality, event-bus, life-graph
                |
                v
  [3] Persistence + Messaging Primitives
      SQLite (canonical), JSON fallback (dev compatibility), optional NATS
                |
                v
  [4] Module Platform
      module-loader + runtime modules + module contracts
                |
      ------------------------------
      Optional / non-MVP-by-default boundary
      ------------------------------
                |
      [5] Companion Surfaces
          desktop/mobile/home-display
                |
      [6] Extended Service Stack
          profile-gated services, optional Postgres/Neo4j, advanced platform flows
```

## Component Inventory by Boundary Layer

### 1. CLI Hero Loop

- `@lifeos/cli`
- hero loop commands: capture, inbox triage, planning/next actions, reminders, review

### 2. Core Runtime Packages

- `@lifeos/goal-engine`
- `@lifeos/life-graph`
- `@lifeos/event-bus`
- `@lifeos/module-loader`
- `@lifeos/orchestrator`
- `@lifeos/personality`
- `@lifeos/sync-core`

### 3. Persistence and Messaging Primitives

- Current canonical persistence: local SQLite life graph
- Documented compatibility fallback: JSON-file adapter when SQLite native addon is unavailable
- Messaging: local in-process event bus with optional local NATS
- Extended/non-MVP data stores: Postgres, Neo4j, and other larger service-stack stores

### 4. Module Platform

- Runtime modules under `modules/`
- Module SDK/runtime contracts under `packages/module-*` and loader packages
- Two explicit module contract layers:
  - `lifeos.json`: distribution/security/trust contract
  - runtime manifest (`manifest.ts` source and compiled runtime manifest consumed by loader): capability/runtime contract

### 5. Companion Surfaces

- `apps/desktop`
- `apps/mobile`
- `apps/home-display`

These are valid surfaces but not the primary MVP runtime obligation.

### 6. Extended Service Stack

- profile-gated Compose services and broader platform services under `services/`
- advanced/optional deployments and future-phase context

This layer is optional/non-MVP by default, not abandoned.

## Dependency Direction Rules

1. Core runtime packages may depend inward on shared primitives and contracts.
2. Modules are extension units and should not be imported directly by app/service surfaces except through defined runtime/application contracts.
3. App/service surfaces should integrate through contracts, events, or runtime loader APIs, not by tight coupling to module internals.
4. Current exceptions must be documented as transitional architecture debt.

## Mesh Vocabulary (Locked)

- **local orchestration mesh**: bounded current runtime coordination (single-node-first; optional local delegation behaviors)
- **node/federation mesh**: optional or future cross-node delegation/federation context
- **mesh service**: use only when referring to an actual separately deployed runtime/service boundary

Use these terms consistently in MVP review docs.

## Architectural Review Rules for Later Phases

1. Judge current MVP architecture primarily through the CLI-centered local runtime shape.
2. Do not fail current MVP reviews because optional extended platform layers are incomplete.
3. Treat extended stack concerns as optional/non-MVP unless explicitly promoted into the current product contract.
4. Require explicit justification for boundary violations, especially direct module imports by app/service surfaces.

## Current Clarifications / Debt

- Compose profile name `dormant` is retained for compatibility; it means optional/non-MVP extended platform services, not abandoned code.
- Some docs still use historical "agent mesh" wording; interpret this as local orchestration mesh unless explicitly discussing future node/federation behavior.
- Transitional coupling may exist in selected areas where app/service code references module-adjacent concerns directly; these should be tracked and reduced over time.