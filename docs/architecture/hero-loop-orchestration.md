> **Status: Current Implementation Guide** — This document reflects the actual runtime behavior of the LifeOS hero loop as of the current codebase. It is not aspirational.

| Stage | Command | Writes | Event Published |
|---|---|---|---|
| Capture | `lifeos capture` | `CaptureEntry` | `lifeos.capture.recorded` |
| Triage | `lifeos inbox triage` | `PlannedAction` / note / deferred `CaptureEntry` | `lifeos.inbox.triaged` |
| Plan | `lifeos goal` | `GoalPlan` | `lifeos.mesh.delegate.completed` or `lifeos.mesh.delegate.fallback_local` |
| Remind | `lifeos remind` | `ReminderEvent` | `lifeos.reminder.followup.created` |
| Tick | `lifeos tick` | _(nothing)_ | `lifeos.tick.overdue` |
| Complete | `lifeos task complete` | `LifeGraphTask` or `PlannedAction` | `lifeos.task.completed` |
| Review | `lifeos review` | _(nothing — derived)_ | _(none)_ |

## Who is the real orchestrator?

LifeOS uses a three-layer orchestration model.

- **CLI** is the primary hero-loop sequencer. It drives each stage in response to explicit user commands.
- **Orchestrator module** (`modules/orchestrator`) is a proactive event sidecar. It subscribes to runtime events and emits suggestions or follow-up actions without blocking the CLI.
- **Module-loader** is the runtime policy harness. It enforces manifest permissions, capability gates, and module lifecycle (load/unload/enable/disable).

## Automation guardrails

- **Bounded retries**: `publishEventSafely` uses `maxReconnectAttempts: 0` and a 2 s publish timeout. Publish failures are non-fatal.
- **Delegation timeouts**: Mesh delegation uses a configurable `LIFEOS_MESH_DELEGATION_TIMEOUT_MS` with local fallback.
- **Suggestion dedup**: Orchestrator module deduplicates suggestions before emitting `lifeos.orchestrator.suggestion`.
- **Leader gating**: Mesh `assign` and `delegate` operations check leader health before proceeding.
- **Permission controls**: Module manifests declare required `graph`, `voice`, `network`, and `events` permissions, and the module-loader enforces these at load time.