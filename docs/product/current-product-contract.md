> **Status: current contract**
> This document is the primary source of truth for the current LifeOS release target.
> See [`docs/vision/roadmap.md`](../vision/roadmap.md) for the full phase sequence.

## Purpose

This document is the single authoritative source for the current LifeOS product contract. It exists to give contributors, reviewers, and anyone evaluating what LifeOS is today a clear, stable reference for what is in scope, what is promised, and what is explicitly out of scope for the current release target. It supersedes any implied scope that might be read from architectural or vision documents alone.

## What LifeOS is today

LifeOS is currently a local-first Personal Operations OS with a CLI-first MVP. Its active product slice is the daily hero loop: capture, triage, plan, reminders/next actions, and review. The broader Personal AI Node vision remains important architectural context, but it is not the active release contract unless explicitly linked from current MVP docs.

## Current release target

**Phase 3 — Personal Operations OS MVP + Daily-Use Validation**

See [`docs/vision/roadmap.md`](../vision/roadmap.md) for the full phase sequence and [`docs/vision/personal-operations-os-mvp.md`](../vision/personal-operations-os-mvp.md) for the detailed MVP definition.

## Current MVP loop

The active product slice is the daily hero loop, defined in order as:

1. capture
2. inbox triage
3. planning
4. reminders/next actions
5. daily/weekly review

## Binding promises now

The following table defines what is and is not binding in the current release contract. Items in the left column are active commitments; items in the right column are architectural context or future work only.

| Binding now | Not binding yet |
|---|---|
| CLI-first hero loop | Room-aware automation |
| Local-first storage and sync | Receptionist flows |
| Life graph persistence | Full smart-home orchestration |
| Reminders / reviews / next actions | Health/social/economic domain suites |
| Module loader + manifest rules | Federated node ecosystem |
| Trust/reporting surfaces | Agentic web / cognitive internet |

## Not promised yet

The following items are explicitly out of scope for the current release target:

- Room-aware automation and presence-based flows
- Receptionist and ambient intake flows
- Full smart-home orchestration
- Health, social, and economic domain automation suites
- Federated node ecosystem and multi-node coordination
- Agentic web and cognitive internet capabilities

## Supported environments now

| Environment | Support level | Primary use | Notes |
|---|---|---|---|
| Linux/macOS shell (bash/zsh) | Supported | Primary CLI surface | All hero loop commands |
| PowerShell | Supported where noted | CLI surface | Bash-only scripts noted explicitly |
| Docker optional profile | Optional | Full stack / NATS | Not required for CLI MVP |
| Home-server profile | Reference / advanced | Full ambient stack | Phase 6 context; not primary MVP target |
| Web/mobile surfaces | Contract-dependent | Companion surfaces | Not primary MVP surface; Tauri desktop and Expo mobile are companion apps |

## Relationship to older Phase 1 docs

Phase 1 (Personal AI Node) is the completed local foundation — reasoning, life graph, event bus, modules, and bounded agent mesh. It is not the active release contract. Phase 1 docs provide essential foundation context for understanding the architecture, but they do not define the current product target and should not be used as the release scope reference.

## Relationship to future roadmap phases

Phases 4–6 (Mesh + Ecosystem Scale, Agentic Web, Cognitive Internet) are architectural context and long-term direction. They are not release promises and should not be used to evaluate current MVP scope. References to these phases in architectural documents describe where LifeOS is heading, not what it commits to delivering today.

## What later reviews should judge

Reviews of the current release target should evaluate against the following in-scope areas:

- Hero loop clarity (capture → triage → plan → reminders → review)
- CLI reliability and error quality
- Module loader and manifest contract correctness
- Life graph persistence behavior
- Local-first and trust surface behavior

## What later reviews should not judge yet

The following areas are explicitly out of scope for current release reviews:

- Smart-home system integration
- Room awareness and presence flows
- Decentralized / federated node ecosystem
- Broad domain automation (health, social, economic)
