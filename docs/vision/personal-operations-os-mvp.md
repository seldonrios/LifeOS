# Personal Operations OS MVP Plan

## Purpose

Define the Phase 3 execution plan for shipping LifeOS as a daily-use Personal Operations OS.

## Product Wedge

Ship one reliable daily workflow that works end to end:

1. Capture
2. Triage inbox
3. Plan next actions
4. Execute with reminders/approvals
5. Review and close the day

Desktop/web remains the depth surface. Mobile is the companion surface for capture, notifications, and approvals.

## MVP Guardrails

- Keep scope narrow to one hero loop before adding new mesh/network features.
- Stabilize shared contracts before expanding UI and integration count.
- Prefer observable behavior (logs, metrics, artifacts) over implicit correctness.
- Dogfood every day using the same loop and collect friction notes in issues.

## Prioritized Epics

### Epic 1: Core Loop Contracts and Domain Model

Goal: prevent behavior drift across CLI, web, and mobile.

Milestone 1.1: Ship `packages/contracts` for hero-loop entities, events, and API DTOs.

Acceptance criteria:

- `capture`, `inbox`, `plan`, `reminder`, and `review` types are defined in one package.
- CLI/web/mobile consume shared types (no duplicate local type definitions for the loop).
- Changes to contracts require semver-aware changelog entries.

Milestone 1.2: Define stable error code taxonomy for user-facing failures.

Acceptance criteria:

- Every user-facing failure in the hero loop exposes a stable error code.
- Error payloads include actionable next step text.
- At least one integration test asserts error-code behavior.

### Epic 2: Hero Loop Runtime Reliability

Goal: make daily use dependable under normal and degraded conditions.

Milestone 2.1: Add end-to-end integration journey test for the hero loop.

Acceptance criteria:

- One test executes capture -> triage -> plan -> reminder schedule -> complete -> review.
- One failure-mode test validates behavior when a dependency is unavailable.
- Test runs in CI on pull requests.

Milestone 2.2: Add runtime observability artifacts.

Acceptance criteria:

- Hero-loop CI jobs publish logs and relevant artifacts for every run.
- Module validation uploads command logs on success and failure.
- Contributors can diagnose failures from artifact output alone.

### Epic 3: Opinionated Product Surface

Goal: make installation and first daily run repeatable for new users.

Milestone 3.1: Publish one recommended installation path for the MVP.

Acceptance criteria:

- README and setup docs present a single default path first.
- First-run docs show the full hero loop command flow.
- Bug template asks for minimal reproducible command sequence.

Milestone 3.2: Mobile companion baseline.

Acceptance criteria:

- Mobile supports fast capture and reminder approval actions.
- Desktop/web remains primary for triage/planning/review depth tasks.
- Shared contract package is used by mobile and desktop/web flows.

### Epic 4: Daily-Use Validation and Governance

Goal: operationalize product quality gates around real usage.

Milestone 4.1: PR product definition of done.

Acceptance criteria:

- PR template includes explicit checks for hero-loop behavior changes.
- Behavior-impacting PRs include test evidence and docs updates.
- UX evidence (CLI output or screenshots) is required for user-facing changes.

Milestone 4.2: Privacy-safe contributor intake.

Acceptance criteria:

- Bug report template warns reporters not to include personal data.
- Logs guidance explicitly requires redaction before submission.

## Exit Criteria for Phase 3

Phase 3 is complete when all conditions are true:

- A new user can run the full hero loop from setup docs without maintainer intervention.
- Hero-loop integration tests are green and stable in CI for two consecutive releases.
- Dogfooding logs show the team can rely on the workflow daily.
- Major regressions in capture/inbox/reminder/review are caught by contracts + tests before merge.
