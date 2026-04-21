# Phase 1 Overview

> **Status: foundation context**
> This document describes the completed Phase 1 Personal AI Node foundation.
> It is not the current release target.
> For the active MVP contract, see [`docs/product/current-product-contract.md`](../product/current-product-contract.md).

[Back to Home](Home.md)

Phase 1 is the stage where LifeOS became a buildable local foundation. Phase 1 established the Personal AI Node as the local foundation. The current release target is Phase 3 — see the Current Product Contract.

## The Main Goal

The goal of Phase 1 is to define a coherent local system that can:

- reason about user requests and plans
- store durable personal context in a life graph
- react to events across services and devices
- support domain modules cleanly
- run on realistic user-controlled hardware

This stage is about making the system understandable and extensible, not pretending every subsystem is already complete.

## What Is In Scope (Phase 1 Foundation)

Phase 1 focuses on a practical local-first base, including:

- local reasoning and planning flows
- a life graph for personal context
- an event-driven automation layer
- a bounded local agent mesh
- a module system for domain growth
- a bounded local simulation capability for what-if analysis and planning
- documentation and reference architecture that make the system understandable enough to prototype responsibly

## Architectural Compatibility Targets

These areas matter as Phase 1 extension targets and reference architecture, but they are not current MVP obligations:

- local integrations such as calendars, sensors, wearables, and home systems
- voice, media, room-awareness, receptionist patterns, and dashboard surfaces
- broader domain areas such as health, social coordination, production, and economic planning

## The System Boundary

Phase 1 centers on a single personal node running primarily on user-controlled hardware. It can connect to outside services, but it should still be useful on its own.

That means the reference boundary includes:

- the local server
- local dashboards and control surfaces
- modules consuming shared events and life-graph context
- voice, media, and room-level signals as part of the foundation architecture

## What Phase 1 Is Not

Phase 1 is not a promise to deliver the full future roadmap right away.

It is not about:

- large-scale decentralized AI networks
- broad AI-to-AI internet protocols
- enterprise infrastructure requirements from day one
- a polished consumer platform with every subsystem finished

It also does not make room-aware automation, receptionist flows, or broader domain suites into current Phase 3 release requirements.

That discipline matters because the project succeeds only if the local foundation is credible.

## Read Next

- [Architecture Overview](Architecture-Overview.md)
- [How Modules Work](How-Modules-Work.md)
- [Phase 1 Landing Page](../phase-1/README.md)
- [Phase 1 Scope](../phase-1/scope.md)
