# Hero Loop Change Map

This map shows where to make changes for each Hero Loop stage and what to validate before merging.

## Stage 1 — Capture

### Files to edit

- `packages/cli/src/index.ts` (command wiring)
- `packages/life-graph/src/` (CaptureEntry schema)
- `packages/contracts/src/` (event topic definitions)

### Contracts to check

- `CaptureEntry` shape in `packages/life-graph/src/types.ts`
- `lifeos.capture.recorded` event topic in `packages/contracts/src/`
- `packages/event-bus/` publish contract

### Tests to run

- `pnpm --filter @lifeos/cli run test`
- `pnpm --filter @lifeos/life-graph run test`
- `scripts/test-core-loop.ts`

### Docs to update

- `docs/architecture/hero-loop-orchestration.md` (stage table)
- `docs/product/current-product-contract.md` if command surface changes

### Common failure modes

- `CaptureEntry` written without required fields -> life-graph validation error
- Event published before graph write completes -> orphaned event

## Stage 2 — Inbox / Triage

### Files to edit

- `packages/cli/src/index.ts`
- `packages/life-graph/src/` (PlannedAction, deferred CaptureEntry)
- `packages/contracts/src/` (`lifeos.inbox.triaged` topic)

### Contracts to check

- `PlannedAction` shape
- Triage action enum (`task|note|defer|plan`) in CLI
- `lifeos.inbox.triaged` event envelope

### Tests to run

- `pnpm --filter @lifeos/cli run test`
- `packages/cli/src/hero-loop.integration.test.ts`

### Docs to update

- `docs/architecture/hero-loop-orchestration.md`
- `docs/product/current-product-contract.md` (supported command surface table)

### Common failure modes

- Duplicate triage guard (`ERR_TRIAGE_LINK_MISSING`) — see `packages/life-graph/src/`
- Triage without a valid `captureId` link

## Stage 3 — Plan / Schedule

### Files to edit

- `packages/cli/src/goal-interpreter.ts`
- `packages/goal-engine/src/`
- `packages/life-graph/src/` (GoalPlan, PlannedAction projection)
- `packages/cli/src/commands/` (goal command)

### Contracts to check

- `GoalPlan` -> `PlannedAction` projection contract in `packages/goal-engine/`
- Mesh delegation events (`lifeos.mesh.delegate.completed`, `lifeos.mesh.delegate.fallback_local`)
- Ollama model availability (required for planning commands)

### Tests to run

- `pnpm --filter @lifeos/goal-engine run test`
- `pnpm --filter @lifeos/cli run test`
- `packages/cli/src/hero-loop.integration.test.ts`

### Docs to update

- `docs/architecture/hero-loop-orchestration.md`
- `docs/architecture/adr-005-canonical-execution-object.md` if PlannedAction shape changes

### Common failure modes

- Planning command fails when no usable Ollama model is loaded (doctor check: `lifeos doctor`)
- GoalPlan projected subtasks not appearing in `task list` (projection bridge gap)

## Stage 4 — Reminders / Next Actions

### Files to edit

- `packages/cli/src/index.ts` (remind/tick/task commands)
- `packages/reminder-module/src/` or `modules/reminder/src/`
- `packages/life-graph/src/` (ReminderEvent)
- `packages/contracts/src/` (`lifeos.reminder.scheduled`, `lifeos.reminder.suggestion.created`)

### Contracts to check

- `ReminderEvent` shape
- Idempotency key on `lifeos remind`
- `lifeos.tick.overdue` -> suggestion-only (no auto-plan creation)
- `lifeos.reminder.suggestion.created` is non-durable

### Tests to run

- `pnpm --filter @lifeos/reminder-module run test` (or `modules/reminder`)
- `pnpm --filter @lifeos/cli run test`
- `packages/cli/src/hero-loop.integration.test.ts`

### Docs to update

- `docs/architecture/hero-loop-orchestration.md`
- `docs/product/current-product-contract.md` (reminder-overdue behavior note)

### Common failure modes

- Duplicate reminder created (idempotency key missing)
- `lifeos tick --watch` serialized cadence overlap
- Reminder suggestion emitted but event bus non-durable (events lost on restart)

## Stage 5 — Review

### Files to edit

- `packages/cli/src/index.ts` (review command)
- `packages/life-graph/src/` (read-only derived view)
- `packages/goal-engine/src/` (loop insights)

### Contracts to check

- Review is read-only / derived — no graph writes
- Loop-specific insights contract in `packages/goal-engine/`

### Tests to run

- `pnpm --filter @lifeos/cli run test`
- `packages/cli/src/hero-loop.integration.test.ts`

### Docs to update

- `docs/architecture/hero-loop-orchestration.md`

### Common failure modes

- Review surfacing stale data when life-graph SQLite adapter unavailable (JSON fallback)
- Review not showing all PlannedAction states (blocked/cancelled not surfaced)

## Stage 6 — Cross-cutting / Infrastructure

### Files to edit

- `packages/event-bus/src/` (transport, publish contract)
- `packages/life-graph/src/` (storage adapter, mergeDelta)
- `packages/module-loader/src/` (manifest validation, diagnostics)
- `packages/contracts/src/` (shared Zod schemas, event topics)
- `packages/security/src/` (JWT, auth)
- `packages/service-runtime/src/` (route auth modes)

### Contracts to check

- `packages/contracts/src/` Zod schemas are the single source of truth for event envelopes
- `packages/module-loader/src/manifest.ts` `validateLifeOSManifest()` is the manifest validator
- Event bus is non-durable in-memory fallback when NATS unavailable

### Tests to run

- `pnpm run validate` (full pipeline)
- `pnpm --filter @lifeos/event-bus run test`
- `pnpm --filter @lifeos/life-graph run test`
- `pnpm --filter @lifeos/module-loader run test`

### Docs to update

- `docs/architecture/event-model.md`
- `docs/security/secret-policy.md`
- `docs/testing/test-taxonomy.md`
- `docs/platform/contracts.md`

### Common failure modes

- Manifest field added without updating `validateLifeOSManifest()` in `packages/module-loader/src/manifest.ts`
- Event topic added without Zod schema in `packages/contracts/src/`
- JWT secret not set -> hard-fail at startup (by design)
