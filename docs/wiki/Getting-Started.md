# Getting Started

[Back to Home](Home.md)

If you are new to LifeOS, the goal is not to read everything at once. Start by understanding the problem the project is solving, the shape of Phase 1, and how the repo is organized.

## Who This Project Is For

LifeOS is a good fit for people interested in:

- local-first AI systems
- modular software architecture
- personal knowledge and planning systems
- event-driven automation
- home-lab or self-hosted infrastructure
- domain modules such as voice, scheduling, fitness, or production workflows

You do not need to be working on every part of the system. Many contributions are architectural, documentation-focused, or module-specific.

## A Good First Reading Path

Use this order if you want the fastest route to understanding the repo:

1. Read the [Repo README](../../README.md) for the high-level vision.
2. Read the [Docs Index](../README.md) to see the main documentation map.
3. Read the [Vision Overview](../vision/overview.md) to understand the long-term direction.
4. Read the [Phase 1 Overview](../phase-1/README.md) to understand the current target.
5. Read the [Architecture Overview](../architecture/overview.md) to understand the main system pieces.
6. Read the [Setup Guide](../SETUP.md) if you want to run the project locally.

## How To Orient In The Repo

The repo is easier to understand if you think of it in layers:

- `docs/` explains the vision, architecture, and Phase 1 direction
- `modules/` contains domain-oriented module examples and contracts
- `packages/` contains shared platform contracts and runtime building blocks
- `services/` contains service wrappers and runtime entrypoints
- `config/` contains default settings and runtime profiles

This is a docs-first repository, so the documents are not secondary. They are part of the implementation surface.

## The Minimum To Know Before Contributing

Before making changes, it helps to understand four things:

- LifeOS is currently centered on the **Personal AI Node**
- Phase 1 is about a credible local foundation, not the entire long-term vision
- the system is designed around reasoning, the life graph, the event bus, automation, and modules
- existing docs under `docs/` are the canonical source of truth

## Read Next

- [Project Status](Project-Status.md)
- [Phase 1 Overview](Phase-1-Overview.md)
- [Contributing](Contributing.md)
- [Contributor Guide](../CONTRIBUTING.md)
