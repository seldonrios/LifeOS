# Phase 5 Gap-Closure Report

## Scope lock

This report closes **Phase 5 — Goal Engine, Planning, and Execution Loop** gaps for the **current LifeOS MVP only**.

Binding frame for this report:

- Treat LifeOS as a **Phase 3, CLI-first Personal Operations OS MVP**.
- Judge against the active hero loop: **capture -> triage -> plan -> reminders / next actions -> review**.
- Do **not** expand scope to future mesh/federation/smart-home/domain-suite ambitions unless they interfere with the current loop.
- Favor **deterministic, inspectable, bounded** runtime behavior over richer but less reliable planning abstractions.

This is not a future-vision design document. It is a concrete closure plan for making the current daily loop structurally dependable.

---

## Executive summary

## Implementation status (current repo)

Phase 5 MVP loop is now implemented on a single canonical execution lane:

- `task` runtime flows (`list`, `complete`, `next`, `block`, `cancel`, `unblock`) operate on `PlannedAction` only.
- Scheduler voice updates and overdue reschedule suggestions mutate `plannedActions` (not `plans[*].tasks`).
- Reminder lifecycle supports schedule -> fire -> acknowledge/cancel; completion/cancellation cancels future scheduled reminders.
- `inbox triage --action plan` and `goal` projection paths write executable work into `PlannedAction` with provenance (`activationSource`, `planId`).
- Heuristic review/next-action derivation uses `PlannedAction` as execution source-of-truth; `GoalPlan` remains planning context.

`GoalPlan.tasks` remains as planning/decomposition context data and is not used as the normal MVP execution runtime surface.

Phase 5 failed because the current MVP planning/execution surface is split across **two competing runtime models**:

1. `GoalPlan.tasks` embedded inside `graph.plans`
2. `PlannedAction` as the declared canonical hero-loop execution object

That split creates ambiguity in every important loop transition:

- how capture becomes triage
- how triage becomes plan or executable action
- how reminders attach to work
- how completion is recorded
- what `next` should inspect
- what review should summarize

The repo already contains enough working pieces to support the MVP loop, but it needs **one canonical execution lane** and a small set of enforced transitions. Closing Phase 5 does **not** require a bigger AI system. It requires a tighter runtime contract.

### Required closure decision

**Adopt `PlannedAction` as the single canonical MVP execution object.**

For the current MVP:

- `CaptureEntry` = intake object
- `PlannedAction` = canonical execution object
- `ReminderEvent` = canonical reminder object
- `Review` = derived report over those objects plus optional plan context
- `GoalPlan` = planning artifact only, not the primary execution surface

`GoalPlan` may continue to exist for decomposition and context, but it must no longer act as a competing day-to-day task runtime.

---

## Closure target state

Phase 5 can be considered closed only when the following statements are all true.

### Intent representation

- All captured user intent enters as `CaptureEntry`.
- All executable daily work is represented as `PlannedAction`.
- All reminders target `PlannedAction.id`.
- Review and `next` are computed from `PlannedAction`, `ReminderEvent`, and `CaptureEntry` first.
- `GoalPlan` is optional planning support, not a second task runtime.

### Flow behavior

- `capture -> triage` is explicit and stable.
- `triage -> action` or `triage -> note` or `triage -> defer` is explicit and inspectable.
- `goal -> plan` can generate suggested actions, but execution must land in `PlannedAction`.
- task completion updates the same execution object the reminder and review logic inspect.
- reminder scheduling, firing, acknowledgment, and cancellation are part of one coherent loop.
- review reflects the same execution state used by next-action logic.

### Runtime discipline

- no CLI command treats `GoalPlan.tasks` as the primary execution surface
- no runtime module creates orphaned execution artifacts outside the canonical loop
- automation stays bounded and explainable
- suggestion and action remain clearly distinct

---

## Phase 5 gap map and closure plan

## Gap 1 — Competing runtime models

### Problem

The MVP currently has two task-like surfaces:

- `GoalPlan.tasks`
- `PlannedAction`

This causes split behavior in task listing, completion, overdue handling, reminder follow-up behavior, scheduling logic, and review generation.

### Closure decision

**Make `PlannedAction` the only canonical execution object for MVP daily use.**

### Required changes

#### 1.1 Contract clarification

Update docs and contracts to state clearly:

- `GoalPlan` is a **planning artifact**
- `PlannedAction` is the **execution artifact**
- `LifeGraphTask` is no longer a daily-use runtime task model for MVP hero-loop behavior

#### 1.2 CLI behavior rewrite

Change the following commands to operate on `PlannedAction` first:

- `lifeos task list`
- `lifeos task complete`
- `lifeos next`
- `lifeos tick`

Current compatibility shims must be removed after migration.

#### 1.3 Module behavior rewrite

Update these modules so they no longer treat `GoalPlan.tasks` as the operational task runtime:

- `scheduler-module`
- `reminder-module`
- any orchestrator logic that treats plan tasks as open daily work

#### 1.4 Review rewrite

`generateReview()` must derive wins, next actions, and loop summary from:

- `CaptureEntry`
- `PlannedAction`
- `ReminderEvent`

`GoalPlan` may be included only as context, not as the primary execution count.

### Acceptance criteria

- `lifeos task list` returns only canonical execution items
- `lifeos task complete <id>` only completes canonical execution items
- `lifeos next` is derived from canonical execution items
- `lifeos tick` checks canonical execution due dates
- review next actions match the same execution universe used by `task` and `next`

### Severity

**Critical**

---

## Gap 2 — No explicit bridge from planning output to execution output

### Problem

`lifeos goal` produces `GoalPlan` with embedded tasks, but the daily hero loop depends on `PlannedAction`. There is no clean, explicit bridge between the two.

### Closure decision

Introduce a **plan-to-action projection step**.

### Required changes

#### 2.1 Add projection rules

After goal interpretation, a plan must be projected into zero or more `PlannedAction` records.

Projection rules for MVP:

- Each actionable plan task becomes a `PlannedAction`
- `goalId` links back to the parent `GoalPlan.id`
- due dates map where possible
- priority maps into a bounded execution priority field if needed in the contract
- only a bounded number of actions should be activated immediately

#### 2.2 Split planning from activation

Support two explicit modes:

- **plan-only**: generate/store plan artifact only
- **plan-and-activate**: generate plan and project top executable steps into `PlannedAction`

Recommended MVP default:

- `lifeos goal` should **plan and activate** the top next executable steps
- deeper plan detail can remain stored in `GoalPlan`

#### 2.3 Add projection metadata

Extend `PlannedAction` with minimal optional fields if needed:

- `planId` or `goalPlanId`
- `activationSource` (`capture_triage`, `goal_projection`, `manual`, `automation`)
- `sequence` or `parentPlanStepId` only if needed for ordering

### Acceptance criteria

- `lifeos goal "..."` produces a stored plan plus canonical execution items when save mode is on
- projected actions appear in `task list`, `next`, `tick`, `review`
- no goal-generated task lives only inside `GoalPlan.tasks` if it is meant to be executed in daily use

### Severity

**High**

---

## Gap 3 — Capture-to-triage-to-plan path is under-specified

### Problem

The inbox flow is usable, but it mostly branches into:

- task
- note
- defer

It does not yet cleanly support “this capture should become a plan” within the same hero loop.

### Closure decision

Extend triage so capture can resolve into either:

- note
- deferred capture
- single planned action
- goal/plan artifact + projected planned actions

### Required changes

#### 3.1 Expand inbox triage action set

Add a `plan` triage action.

Recommended CLI shape:

```bash
lifeos inbox triage <capture-id> --action plan
```

Behavior:

- create a `GoalPlan` from capture content
- project executable steps into `PlannedAction`
- mark the capture as triaged
- store linkage between capture and generated plan/actions

#### 3.2 Preserve lineage

For all triage outputs, preserve:

- `sourceCapture`
- resulting note id and/or action id and/or plan id

This should be queryable for inspection and future audit surfaces.

#### 3.3 Make triage deterministic for MVP

Triage in current MVP should remain explicit and user-invoked.

Do **not** auto-triage captures by default in the MVP loop.

### Acceptance criteria

- user can turn a capture into a plan without leaving the hero loop
- resulting actions appear in canonical execution surfaces
- capture lineage is preserved

### Severity

**High**

---

## Gap 4 — Reminder lifecycle is incomplete

### Problem

The system clearly schedules reminders, but the inspected runtime is weak or unclear around:

- firing
- acknowledgment
- cancellation semantics
- follow-up behavior tied to canonical execution state

### Closure decision

Implement the full `ReminderEvent` lifecycle as a bounded runtime loop.

### Required changes

#### 4.1 Support all reminder states in runtime

Required reminder states already exist in contract form:

- `scheduled`
- `fired`
- `acknowledged`
- `cancelled`

Now make them operational.

#### 4.2 Add reminder tick processor

Create one bounded reminder processor that:

- scans for due `ReminderEvent(status=scheduled)`
- marks them `fired`
- emits a reminder-fired event
- avoids double-firing by idempotent update logic

#### 4.3 Add acknowledgment command

Add explicit CLI acknowledgment support.

Recommended command:

```bash
lifeos remind ack <reminder-id>
```

or

```bash
lifeos reminder ack <reminder-id>
```

#### 4.4 Auto-cancel stale reminder conditions

When an associated `PlannedAction` is completed:

- all future scheduled reminders for that action should be cancelled automatically

When a planned action is deferred/rescheduled:

- linked reminders should either be cancelled or shifted in a deterministic, inspectable way

### Acceptance criteria

- reminders can be scheduled, fired once, acknowledged, and cancelled
- completed actions do not retain active future reminders
- review loop can correctly count unacknowledged fired reminders

### Severity

**High**

---

## Gap 5 — Deferred, blocked, cancelled, paused, and failed semantics are inconsistent

### Problem

The rich `goal-engine` state machine includes many statuses, but the canonical hero-loop runtime does not reflect them consistently.

### Closure decision

Keep MVP execution states minimal, but complete.

### Required changes

#### 5.1 Normalize MVP execution states

For `PlannedAction`, the MVP should support at least:

- `todo`
- `done`
- `deferred`
- `cancelled`
- `blocked`

If `blocked` or `cancelled` is not added, then explicitly declare they are out of MVP scope and remove any implication that they exist operationally.

Recommended path: add them now because they are important for a dependable daily loop.

#### 5.2 Normalize defer behavior

Current defer behavior marks the capture as triaged and tags it deferred.

Instead, MVP defer should be explicit in one of two ways:

- keep as unresolved capture with a visible deferred flag
- or create a canonical `PlannedAction(status=deferred)`

Recommended path: create a canonical deferred `PlannedAction` so the execution loop can see it and review can summarize it.

#### 5.3 Add blocked handling

Users need a first-class way to indicate “I cannot do this yet.”

Recommended command:

```bash
lifeos task block <action-id> --reason "waiting on vendor"
```

Minimal MVP storage can use:

- `status=blocked`
- optional reason metadata

#### 5.4 Add cancellation path

Recommended command:

```bash
lifeos task cancel <action-id>
```

Cancellation should also cancel future reminders for that action.

### Acceptance criteria

- defer does not disappear outside the execution model
- blocked and cancelled items are representable or explicitly removed from MVP promise
- review can distinguish done vs deferred vs blocked work

### Severity

**Medium-High**

---

## Gap 6 — Completion path is split

### Problem

Completion currently has a primary path for `GoalPlan.tasks` and a fallback compatibility shim for `PlannedAction`.

That is the reverse of what the MVP needs.

### Closure decision

Make completion canonical on `PlannedAction` only.

### Required changes

#### 6.1 Rewrite `task complete`

`lifeos task complete` should:

- resolve only canonical execution ids / prefixes
- update `PlannedAction.status=done`
- stamp `completedAt`
- cancel future reminders for that action
- emit task/action completed event

#### 6.2 Remove fallback shim after migration

The current “planned-action fallback” must be temporary only. Remove it after the migration window.

#### 6.3 Optional plan sync-back

If desired, sync completion back into related `GoalPlan` context as derived metadata, but never make that the source of truth.

### Acceptance criteria

- completion updates the same object reviewed by next/remind/review
- no compatibility shim remains in steady-state MVP runtime

### Severity

**High**

---

## Gap 7 — Review is generated, but not tightly aligned to execution reality

### Problem

Review exists and is useful, but it currently mixes plan tasks and planned actions, and it has no explicit reviewed-state or close-out semantics.

### Closure decision

Keep review generated and stateless for MVP, but ensure it is derived from one coherent loop.

### Required changes

#### 7.1 Make execution data primary

Review must derive its loop summary from:

- pending captures
- active planned actions
- completed planned actions
- deferred/blocked/cancelled planned actions if supported
- fired/unacknowledged reminders

#### 7.2 Add deterministic next-action fallback

If LLM review generation fails, the fallback should use canonical `PlannedAction` ordering only.

#### 7.3 Add optional close-day surface

Without adding a heavy review-session model, support a lightweight explicit close-out command.

Recommended command:

```bash
lifeos review close-day
```

This may simply append a timestamped memory or review marker. The MVP does not need a full persisted review-session graph, but it does need an explicit user-visible review completion affordance if the product contract continues to emphasize review as part of the daily loop.

### Acceptance criteria

- review output matches canonical execution state
- next-action suggestions do not come from a competing task universe
- review can be considered complete from the user’s perspective, even if fully sessionized review is deferred

### Severity

**Medium**

---

## Gap 8 — Suggestion vs action boundary is not formal enough

### Problem

The CLI is generally explicit, but some module behavior creates new follow-up planning artifacts automatically. That can blur the line between suggestion and execution.

### Closure decision

Formalize one MVP automation rule:

> automation may create **suggestions** and bounded **supporting reminders**, but must not create durable executable work silently unless the product explicitly defines that behavior.

### Required changes

#### 8.1 Add action provenance

All created `PlannedAction` records should include provenance such as:

- `manual_capture_triage`
- `goal_projection`
- `module_auto_followup`
- `user_confirmed_from_suggestion`

#### 8.2 Restrict silent work creation

For MVP:

- reminder and scheduler modules may emit suggestions/events
- they should not silently create canonical executable actions unless explicitly approved or explicitly documented as part of the product contract

#### 8.3 Change follow-up behavior

The reminder module should stop creating follow-up `GoalPlan` artifacts for overdue work as its primary response.

Instead it should do one of the following:

- create a reminder/suggestion event only
- propose a follow-up action pending confirmation
- add bounded metadata to the existing planned action (e.g. overdue flag, suggested reschedule)

Recommended path: **no automatic new executable action creation** in MVP.

### Acceptance criteria

- user can tell whether something is a suggestion, a reminder, or a durable executable action
- automation-created items have provenance
- no silent plan sprawl from overdue handling

### Severity

**Medium**

---

## Gap 9 — Goal-engine design is ahead of the runtime contract

### Problem

The `goal-engine` package has a much richer conceptual model than the runtime hero loop.

That is not bad, but it becomes a Phase 5 gap when the richer model implies runtime capabilities the MVP does not actually support.

### Closure decision

Split `goal-engine` into:

- **MVP-active runtime contract**
- **future design scaffolding**

### Required changes

#### 9.1 Mark active vs future types

In docs and code comments, mark which `goal-engine` types are:

- active in MVP runtime
- future/not yet wired

Examples likely still future for MVP runtime unless implemented now:

- approval modes beyond simple explicit CLI confirmation
- replanning requests/results
- agent work request/result workflows
- full constraint enforcement engine
- rich goal/plan/task lifecycle independent of `PlannedAction`

#### 9.2 Shrink exported active surface where needed

If necessary, create an `mvp-runtime.ts` export or equivalent to make the live runtime contract obvious.

#### 9.3 Prevent false completeness

README/docs should stop implying that the richer internal planning model is already the working hero-loop runtime if it is not.

### Acceptance criteria

- contributors can tell what is live runtime vs future scaffolding
- Phase 5 closure is measured against the real runtime contract only

### Severity

**Medium**

---

## Recommended canonical MVP state machine

This is the proposed state machine to close Phase 5 cleanly without over-expanding scope.

## CaptureEntry

States:

- `pending`
- `triaged`

Transitions:

- `pending -> triaged`

Notes:

- capture remains intake-only
- do not overload capture to also behave as execution state

## PlannedAction

Recommended states:

- `todo`
- `deferred`
- `blocked`
- `done`
- `cancelled`

Transitions:

- `todo -> done`
- `todo -> deferred`
- `todo -> blocked`
- `todo -> cancelled`
- `deferred -> todo`
- `deferred -> cancelled`
- `blocked -> todo`
- `blocked -> cancelled`

Optional MVP simplification if blocked/cancelled are deferred:

- keep only `todo | deferred | done`

But this report recommends adding `blocked` and `cancelled` now.

## ReminderEvent

States:

- `scheduled`
- `fired`
- `acknowledged`
- `cancelled`

Transitions:

- `scheduled -> fired`
- `scheduled -> cancelled`
- `fired -> acknowledged`
- `fired -> cancelled` only if you allow cleanup after late completion

## Review

Review remains **generated**, not persisted as a full session entity, but should be able to close a loop through a lightweight marker command if desired.

---

## Required data model changes

## PlannedAction

Recommended additions:

```ts
interface PlannedAction {
  id: string;
  title: string;
  dueDate?: string;
  reminderAt?: string;
  completedAt?: string;
  status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
  goalId?: string;
  sourceCapture?: string;
  planId?: string;
  activationSource?:
    | 'capture_triage'
    | 'goal_projection'
    | 'manual'
    | 'automation';
  blockedReason?: string;
  deferredUntil?: string;
}
```

Only add fields that the current MVP will actually use.

## CaptureEntry

Recommended optional lineage fields:

- `triagedToActionId?`
- `triagedToPlanId?`
- `triagedToNoteId?`

These may also be derived elsewhere if direct storage is not desired, but the lineage must be reliably inspectable.

## ReminderEvent

Potential additions if needed:

- `firedReason?`
- `acknowledgedAt?`

Only add if the current runtime actually needs them.

---

## Implementation workstreams

## Workstream A — Canonical runtime consolidation

### Objective

Consolidate the hero loop around `PlannedAction`.

### Tasks

- update docs/contracts to declare one canonical execution object
- rewrite task list/complete/next/tick against `PlannedAction`
- rewrite review derivation against `PlannedAction`
- remove steady-state dependence on `GoalPlan.tasks`

### Exit criteria

- all core hero-loop commands inspect the same runtime object set

---

## Workstream B — Plan projection

### Objective

Bridge `GoalPlan` output into the execution loop.

### Tasks

- implement plan-to-action projection
- define projection limits and ordering
- attach provenance metadata
- add optional `plan` triage mode

### Exit criteria

- `lifeos goal` can participate in the same execution loop as inbox-triaged work

---

## Workstream C — Reminder lifecycle completion

### Objective

Make reminders operational, not just storable.

### Tasks

- add reminder firing processor
- add reminder acknowledge command
- auto-cancel future reminders on completion/cancellation
- keep reminder state transitions idempotent

### Exit criteria

- reminders support schedule -> fire -> acknowledge/cancel

---

## Workstream D — Action state completion

### Objective

Finish the minimal runtime state machine for daily use.

### Tasks

- normalize defer semantics
- add blocked/cancelled if adopted
- add CLI commands for unblock/cancel/und defer if needed
- ensure review surfaces these states

### Exit criteria

- user can represent real daily loop outcomes cleanly

---

## Workstream E — Automation boundary hardening

### Objective

Prevent silent action sprawl.

### Tasks

- stop overdue modules from creating new canonical work silently
- convert auto-follow-up behavior to suggestions or annotations
- store action provenance

### Exit criteria

- all durable executable actions are clearly attributable

---

## Migration plan

## Phase 5 closure migration order

### Step 1 — Lock the canonical runtime model

Do first.

- update docs
- update contract comments
- declare `PlannedAction` canonical for MVP execution

### Step 2 — Rewrite command surfaces

Do second.

- `task list`
- `task complete`
- `next`
- `tick`
- `review`

### Step 3 — Add plan projection

Do third.

- projection from goal-plan output to `PlannedAction`
- inbox `--action plan`

### Step 4 — Complete reminder lifecycle

Do fourth.

- fire
- acknowledge
- cancel on completion

### Step 5 — Remove compatibility shims

Do fifth.

- delete fallback logic that keeps `GoalPlan.tasks` acting as runtime execution state

### Step 6 — Audit automation boundaries

Do last.

- ensure no module silently creates unapproved execution work

---

## Required test coverage

## Unit tests

### Runtime object tests

- `PlannedAction` valid/invalid transitions
- reminder lifecycle transitions
- defer/block/cancel state updates
- completion auto-fills `completedAt`

### Projection tests

- goal plan projects into canonical actions
- projection preserves source metadata
- projection limits bound active work creation

### Review tests

- review summary counts canonical pending captures
- review summary counts canonical due actions
- review summary counts fired/unacknowledged reminders
- heuristic next actions derive from `PlannedAction` only

## CLI integration tests

- `capture -> inbox triage task -> remind -> fire -> ack -> review`
- `capture -> inbox triage plan -> projected actions -> complete -> review`
- `goal -> projected actions -> task list -> next -> complete`
- `defer/block/cancel` behaviors if adopted

## Migration tests

- old graphs with `GoalPlan.tasks` remain readable
- migrated runtime commands operate on projected `PlannedAction` records
- compatibility shim can be removed without hero-loop breakage

## Regression tests

- no command returns mixed execution universes
- no module recreates duplicate reminders or duplicate projected actions

---

## Documentation updates required to close the phase honestly

Update the following docs after implementation:

- `README.md`
- current product contract
- current system boundary
- CLI command help text
- any goal-engine docs that imply richer live runtime behavior than actually exists

### Required wording changes

- state explicitly that `PlannedAction` is the MVP execution object
- state whether `GoalPlan` is planning-only or also activation-capable via projection
- state whether review is generated-only with optional close-day marker
- state whether blocked/cancelled are supported in current MVP

---

## Ticket breakdown recommendation

## Ticket 1

**ADR: Canonical MVP execution object is PlannedAction**

Deliverables:

- short ADR
- contract comments updated
- docs language aligned

## Ticket 2

**Refactor CLI task/next/tick/review to canonical execution model**

Deliverables:

- task commands rewritten
- next rewritten
- tick rewritten
- review rewritten

## Ticket 3

**Implement goal-plan to planned-action projection**

Deliverables:

- projection logic
- provenance fields
- tests

## Ticket 4

**Add inbox triage plan mode**

Deliverables:

- CLI support
- lineage fields or derivation path
- tests

## Ticket 5

**Complete reminder lifecycle runtime**

Deliverables:

- reminder fire processor
- ack command
- auto-cancel behavior
- tests

## Ticket 6

**Normalize defer/block/cancel action states**

Deliverables:

- contract update
- CLI transitions
- review support
- tests

## Ticket 7

**Remove GoalPlan task runtime shim**

Deliverables:

- compatibility migration
- shim deletion
- regression tests

## Ticket 8

**Harden automation boundary and provenance**

Deliverables:

- module behavior changes
- action provenance
- docs/tests

---

## Phase 5 close-out checklist

Phase 5 should remain open until all of the following are true.

- [ ] One canonical execution object is declared and enforced
- [ ] `task`, `next`, `tick`, `review`, and reminders operate on the same runtime model
- [ ] `goal` output can enter the hero loop through projected canonical actions
- [ ] capture triage can resolve into single action, note, defer, or plan cleanly
- [ ] reminders can schedule, fire, acknowledge, and cancel
- [ ] completion updates the same object reminders and review inspect
- [ ] defer semantics are canonical and visible in review
- [ ] automation provenance exists for durable execution items
- [ ] no silent auto-created execution work remains outside policy
- [ ] compatibility shims depending on `GoalPlan.tasks` as runtime execution are removed
- [ ] docs describe the real runtime accurately
- [ ] test evidence exists for full hero-loop behavior

---

## Final closure standard

**Phase 5 may be re-evaluated as Pass with clarifications only after the MVP has one coherent intent-to-action lane.**

That lane should be:

```text
CaptureEntry -> explicit triage -> PlannedAction -> ReminderEvent -> completion/update -> generated review
```

with `GoalPlan` serving as planning support that projects into this lane instead of competing with it.

Until that is true, the hero loop may work in demos, but it is not yet structurally dependable enough to underwrite later assumptions about daily use.
