# ADR-005 — Canonical MVP Execution Object

## Status
Accepted

## Context
The Phase 3 MVP hero loop currently has two competing execution models: `GoalPlan.tasks` (embedded `LifeGraphTask` records inside a `GoalPlan`) and `PlannedAction` (a first-class loop entity).

CLI commands `task list`, `next`, `tick`, and the primary path of `task complete` currently read from `GoalPlan.tasks`, which is the inverse of the declared canonical model. This creates a split execution surface where `review` reads `PlannedAction` but daily commands do not.

## Decision
`PlannedAction` is the single canonical hero-loop execution object for the Phase 3 MVP.

All CLI commands (`task list`, `task complete`, `next`, `tick`, `task block`, `task cancel`, `task unblock`) must operate on `PlannedAction` as their primary source.

`GoalPlan` and its embedded `tasks` array are planning context only. They are not the daily execution surface.

## Consequences
- `GoalPlan.tasks` is retained as a compatibility shim in `task complete` for one migration phase to avoid breaking existing goal-generated data.
- All new Phase 5 CLI commands (`task block`, `task cancel`, `task unblock`, `remind ack`) operate exclusively on `PlannedAction`.
- Goal projection (`lifeos goal`) must write subtasks into `PlannedAction` records (with `activationSource: 'goal_projection'` and `planId` linkage) in addition to storing the `GoalPlan`.
- Inbox triage (`--action defer`, `--action plan`) must create `PlannedAction` records so deferred and plan-triaged work enters the canonical execution lane.
- The `PlannedAction` schema is expanded in P5-A to support the full state machine: `todo | done | deferred | blocked | cancelled`.
