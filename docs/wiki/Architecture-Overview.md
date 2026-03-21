# Architecture Overview

[Back to Home](Home.md)

LifeOS is designed as a local-first system with clear boundaries between reasoning, memory, events, modules, and integrations. The goal is not a single giant assistant process. The goal is a system whose parts can coordinate without collapsing into one opaque blob.

## The Main Pieces

At a high level, the current architecture revolves around:

- **reasoning** for interpreting requests and producing plans
- **the life graph** for durable personal context
- **the event bus** for loose coordination between services and modules
- **automation** for turning signals into workflows
- **modules** for domain-specific behavior
- **integrations** for connecting calendars, devices, sensors, media, and other local systems

## Why It Is Event-Driven

Events are the shared language of change inside the node.

That means a calendar change, a health update, a presence signal, or a voice request can be represented in a common coordination model. This keeps modules and services more loosely coupled and makes cross-domain workflows easier to reason about.

## Why The Life Graph Matters

The life graph is the durable memory layer of the system. It gives LifeOS a way to store ongoing context such as:

- goals
- tasks and plans
- people and relationships
- resources and inventories
- events and relevant context over time

That matters because LifeOS is trying to support real-life coordination, not just one-off prompts.

## Deployment Shape

The reference deployment is a local microservice platform, usually on one home server. Docker Compose is the practical default. The repo stays open to future evolution, but it does not require Kubernetes or enterprise infrastructure to make sense in Phase 1.

## Read Next

- [How Modules Work](How-Modules-Work.md)
- [Current Modules](Current-Modules.md)
- [Architecture Overview Doc](../architecture/overview.md)
- [Reference Architecture](../phase-1/reference-architecture.md)
