# Welcome to the LifeOS Wiki

LifeOS is an open-source attempt to build a personal AI system that is actually useful in everyday life.

The short version is simple: instead of treating AI like a single chat window in the cloud, LifeOS treats it more like a local operating layer for planning, coordination, memory, and automation. The project is built around user control, local-first deployment, modular capabilities, and clear system boundaries.

This wiki is the friendly front door for that work. It is here to help new contributors, curious readers, and future builders understand what LifeOS is trying to become, what already exists in the repo, and what Phase 1 is focused on right now.

## What LifeOS Is

LifeOS is centered on the idea of a **Personal AI Node**: a system that runs on user-controlled hardware and helps with real-life coordination.

That can include things like:

- turning goals into plans and tasks
- keeping durable context about projects, people, and resources
- reacting to events from calendars, devices, and local services
- supporting domain modules such as voice, scheduling, fitness, production, or vision
- staying extensible instead of forcing everything into one giant assistant

The goal is not to build a magical black box. The goal is to build an understandable, modular system that can grow with the user.

## Phase 1 In Plain English

Phase 1 is the foundation stage. In this repo, LifeOS is not trying to ship the full long-term network vision yet. It is trying to make the Personal AI Node real enough to reason about, run locally, and extend safely.

Right now, the project is best understood as a docs-first platform with early implementation surfaces. The architecture is ahead of the runtime, on purpose. The repo is being used to define stable concepts, contracts, and boundaries so contributors can build toward the same system instead of a collection of unrelated experiments.

## How The System Is Shaped

At a high level, the current reference architecture has a few major parts:

- **Reasoning** interprets requests, produces plans, and coordinates actions.
- **The life graph** stores durable context such as goals, tasks, relationships, and resources.
- **The event bus** lets services and modules react to changes without being tightly coupled.
- **Modules** add domain-specific behavior like calendar planning, voice workflows, fitness support, or lightweight homesteading logic.
- **Automation** turns events into concrete workflows across the local node.

The intended deployment shape is a local microservice system, usually on one home server, with Docker Compose as the practical default.

## What The Code Already Shows

Even in the current early code, the design direction is visible:

- modules define metadata, permissions, and a bounded responsibility
- modules subscribe to and emit events instead of hard-wiring direct dependencies
- modules participate in a `plan` and `act` loop rather than acting like isolated scripts
- profiles such as `minimal`, `assistant`, `ambient`, `multimodal`, and `production` describe different runtime shapes
- degraded behavior is called out explicitly so the system can stay useful when a provider is missing

The current module set includes voice, calendar, fitness, economics, homesteading, and lightweight vision ingestion. That already gives the repo a concrete shape, even while the broader runtime remains early.

## How To Use This Wiki

Use the wiki for orientation, then use the main docs for deeper detail. The wiki is meant to be the easy on-ramp, not a second source of truth.

If you are new here, start with the pages below in order:

1. [Getting Started](Getting-Started.md)
2. [Project Status](Project-Status.md)
3. [Phase 1 Overview](Phase-1-Overview.md)
4. [Architecture Overview](Architecture-Overview.md)
5. [How Modules Work](How-Modules-Work.md)
6. [Current Modules](Current-Modules.md)
7. [Contributing](Contributing.md)

## Related Docs

- [Repo README](../../README.md)
- [Docs Index](../README.md)
- [Vision Overview](../vision/overview.md)
- [Phase 1 Overview](../phase-1/README.md)
- [Architecture Overview](../architecture/overview.md)
