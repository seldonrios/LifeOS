> **Status: foundation context**
> This document describes completed Phase 1 foundation work and architectural context.
> It is not the primary source of truth for the current release target.
> For the active MVP contract, see [`docs/product/current-product-contract.md`](../product/current-product-contract.md) and [`docs/vision/personal-operations-os-mvp.md`](../vision/personal-operations-os-mvp.md).

# Phase 1

## Purpose

Define the first implementation stage of LifeOS and give contributors a stable description of what this repository is currently trying to build.

Phase 1 is the **Personal AI Node**. The goal is not to build the entire long-term LifeOS vision immediately. The goal is to establish a useful, local-first base system that can support future expansion without locking the project into premature platform decisions.

For LifeOS, that now means documenting a realistic reference architecture for a technically skilled individual running a local AI server at home.

## Phase 1 Capability Pillars

- Reasoning: local interpretation, planning, and orchestration.
- Life graph: a durable representation of the user's goals, projects, resources, tasks, and context.
- Automation: event-driven reactions and workflows across local systems.
- Modules: domain-specific extensions that plug into the node cleanly.

## What Phase 1 Established

- Established a clear system boundary around the Personal AI Node.
- Established a realistic home-server deployment profile.
- Established a conceptual data model for life graph entities and relationships.
- Established a local event model that supports automation and coordination.
- Established a bounded local agent mesh for specialization and delegation.
- Established a bounded simulation capability for planning and what-if analysis.
- Established a module philosophy that allows growth by domain.
- Established a practical integration story for home, productivity, and personal data sources.
- Established a voice, media, and display story that makes the system usable in everyday life.

## Reference Capability Areas

*(These are Phase 1 architectural extension targets. Current MVP priority is the Phase 3 hero loop — see [`docs/product/current-product-contract.md`](../product/current-product-contract.md).)*

- room-aware automation and follow-me media
- AI receptionist and voice interaction
- production, inventory, and personal economic planning
- health, fitness, and social coordination
- dashboards, mobile surfaces, and terminal workflows

## Read Next

- [Goal Interpreter CLI Demo (MVP #1)](goal-interpreter-cli-demo.md)
- [Reference Architecture](reference-architecture.md)
- [Scope](scope.md)
- [Goals](goals.md)
- [Non-Goals](non-goals.md)
- [Use Cases](use-cases.md)
- [Success Criteria](success-criteria.md)
