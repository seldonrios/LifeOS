> **Status: Current Implementation Guide** — This document reflects the actual runtime behavior of the LifeOS hero loop as of the current codebase. It is not aspirational.

| Stage    | Command                | Writes                                           | Event Published                                                                                    |
| -------- | ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Capture  | `lifeos capture`       | `CaptureEntry`                                   | `lifeos.capture.recorded`                                                                          |
| Triage   | `lifeos inbox triage`  | `PlannedAction` / note / deferred `CaptureEntry` | `lifeos.inbox.triaged`                                                                             |
| Plan     | `lifeos goal`          | `GoalPlan` + projected `PlannedAction` records   | `lifeos.mesh.delegate.completed` or `lifeos.mesh.delegate.fallback_local`                          |
| Remind   | `lifeos remind`        | `ReminderEvent`                                  | `lifeos.reminder.scheduled`                                                                        |
| Tick     | `lifeos tick`          | _(nothing)_                                      | `lifeos.tick.overdue` (reminder module may react by publishing `lifeos.reminder.suggestion.created`) |
| Complete | `lifeos task complete` | `PlannedAction`                                  | `lifeos.task.completed`                                                                            |
| Review   | `lifeos review`        | _(nothing — derived)_                            | _(none)_                                                                                           |

## Who is the real orchestrator?

LifeOS uses a three-layer orchestration model.

- **CLI** is the primary hero-loop sequencer. It drives each stage in response to explicit user commands.
- **Orchestrator module** (`modules/orchestrator`) is a proactive event sidecar. It subscribes to runtime events and emits suggestions without blocking the CLI.
- **Module-loader** is the runtime policy harness. It enforces manifest permissions, capability gates, and module lifecycle (load/unload/enable/disable).

## Automation guardrails

- **Bounded retries**: `publishEventSafely` uses `maxReconnectAttempts: 0` and a 2 s publish timeout. Publish failures are non-fatal.
- **Delegation timeouts**: Mesh delegation uses a configurable `LIFEOS_MESH_DELEGATION_TIMEOUT_MS` with local fallback for hero-loop local-first commands.
- **Suggestion dedup**: Orchestrator module deduplicates suggestions before emitting `lifeos.orchestrator.suggestion`.
- **Leader gating**: `lifeos mesh assign` rejects changes when the current mesh leader is explicitly marked unhealthy. Local-first remote delegation paths (`goal`, `research`, voice publish helper) run a leader-health preflight; when no healthy leader is available they skip remote RPC, emit failed/fallback delegation events, and continue local fallback. Explicit `lifeos mesh delegate` runs the same preflight but fails fast as a control-plane rejection and exits non-zero without fallback telemetry.
- **Permission controls**: Module manifests declare required `graph`, `voice`, `network`, and `events` permissions, and the module-loader enforces these at load time.
