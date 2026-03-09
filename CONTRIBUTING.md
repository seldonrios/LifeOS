# Contributing to LifeOS

## Purpose

Explain how contributors should approach the repository in its docs-first Phase 1 state and where to focus early effort.

LifeOS is at the architecture-definition stage. Contributions should improve clarity, technical alignment, and the quality of the Phase 1 foundation rather than rush speculative implementation.

## Recommended Reading Order

1. Read the [root README](README.md).
2. Read the [docs index](docs/README.md).
3. Read the [Phase 1 landing page](docs/phase-1/README.md).
4. Review the [architecture overview](docs/architecture/overview.md).
5. Check the [contributor map](docs/community/contributor-map.md).

## What Helps Most Right Now

- Tightening Phase 1 scope and success criteria.
- Refining the life graph and event model concepts.
- Proposing module boundaries that stay local-first and composable.
- Stress-testing the Phase 1 reference architecture against realistic home-lab constraints.
- Breaking down the reference stack into prototype-sized services and interfaces.
- Improving documentation clarity, terminology, and developer onboarding.
- Sketching prototype directions without overcommitting the repo to a premature stack.

## Contribution Guidelines

- Keep Phase 1 grounded in current deliverables.
- Mark later-phase ideas as future direction.
- Preserve the four primary pillars: reasoning, life graph, automation, and modules.
- Prefer small, reviewable changes with clear rationale.
- Update related docs when terminology or architecture framing changes.

## What To Avoid

- Treating speculative future concepts as already designed or guaranteed.
- Introducing code structure that implies settled implementation choices.
- Expanding scope into global protocols, autonomous markets, or planetary-scale systems as immediate work.

## Initial Contribution Areas

- Documentation edits and structure improvements.
- Example use cases and user workflows.
- Conceptual schemas for graph entities and event flows.
- Prototype notes for integrations such as Home Assistant, BLE tracking, Asterisk, calendars, and wearables.
- Reference architectures for voice, media, dashboards, and production modules.
