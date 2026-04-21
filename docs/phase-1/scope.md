> **Status: foundation context**
> This document describes completed Phase 1 foundation work and architectural context.
> It is not the primary source of truth for the current release target.
> For the active MVP contract, see [`docs/product/current-product-contract.md`](../product/current-product-contract.md) and [`docs/vision/personal-operations-os-mvp.md`](../vision/personal-operations-os-mvp.md).

# Phase 1 Scope

## Purpose

State what Phase 1 includes operationally so contributors can separate foundational work from later-phase ambitions.

## In Scope (Phase 1 Foundation)

- Local reasoning and planning flows.
- A life graph model for persistent personal context.
- An event-driven automation layer.
- A module system for domain capabilities.
- A bounded local agent mesh for specialized roles.
- A bounded local simulation capability for what-if analysis and planning.
- Documentation that makes the system understandable enough to prototype responsibly.

## B. Architectural compatibility targets

*(The following are Phase 1 architectural extension targets, not current MVP obligations — see [`docs/product/current-product-contract.md`](../product/current-product-contract.md).)*

- Local integrations such as smart home systems, calendars, wearables, sensors, and local storage.
- Voice/media surfaces and room-aware capability patterns.
- Broader domain modules (health, social, production, economic planning).

## C. Explicitly not required for current MVP

- Room-aware automation as a release requirement.
- Receptionist/media routing as a release requirement.
- Health/social/economic modules as current MVP requirements.
- Home-server hardware stack as a mandatory contributor target.

## Phase 1 System Boundary

Phase 1 centers on a single personal node running primarily on user-controlled hardware. It may connect to external services, but it should not depend on a global coordination layer to be valuable.

The system boundary includes:

- the local server
- room-level device and presence signals
- voice and media services
- local dashboards and control surfaces
- modules that consume shared events and life-graph context

## Scope Constraint

When a design question appears, prefer the option that strengthens local usefulness and preserves future extensibility.
