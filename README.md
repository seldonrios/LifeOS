# LifeOS

> Join us in growing decentralized AI for life improvements.
>
> **LifeOS** is a docs-first, open-source vision for a personal AI operating system built around **user sovereignty**, **local-first intelligence**, **modular capabilities**, and **privacy-preserving collaboration**.

LifeOS starts with a simple but ambitious idea:

**AI should help people live better lives without requiring them to give up ownership, privacy, or control.**

We believe the future of personal AI should be:

- **Local-first** when possible
- **User-owned** by default
- **Modular** instead of monolithic
- **Privacy-aware** instead of surveillance-driven
- **Open** so anyone can contribute, extend, and improve it

This repository is intentionally **documentation-first**.  
Our current goal is to define the problem, the architecture, and the first implementation surface clearly enough that contributors can build toward the same system.

---

## Purpose

LifeOS is a long-term vision for a **personal AI operating system**.

Phase 1 focuses on the **Personal AI Node**:

A local system that combines reasoning, a life graph, automation, modules, and local integrations into a practical foundation for personal productivity, decision support, and coordination.

The current reference direction is a **buildable home-brew AI server** with:

- local reasoning
- a bounded multi-agent mesh
- event-driven automation
- room awareness
- voice and media routing
- life simulation
- domain modules for production, health, communications, and personal planning

LifeOS starts as a **personal AI node**, not a monolithic global platform.  
Phase 1 includes a bounded local agent mesh inside that node, while later concepts such as local AI networks and a cognitive internet remain **long-term direction**, not current deliverables.

---

## Why LifeOS?

Most AI products today are built as:

- cloud-first assistants
- closed platforms
- isolated tools
- chat interfaces with limited real-world coordination

LifeOS aims for something different:

- an AI system that can understand your goals
- model your life and projects through a life graph
- coordinate actions across modules and local systems
- help break large milestones into practical daily execution
- remain extensible enough for communities to build their own capabilities

This means LifeOS is not just a chatbot, not just a smart home, and not just a productivity tool.

It is a foundation for:

- personal planning
- home and room-aware automation
- production coordination
- local business support
- fitness and health guidance
- learning and hobby modules
- communications and scheduling
- bounded scenario simulation on local data

---

## Core Principles

### 1. User sovereignty

The user should remain in control of their data, goals, permissions, and automation boundaries.

### 2. Local-first intelligence

Reasoning, coordination, and storage should run locally whenever practical.

### 3. Modular capabilities

LifeOS should grow through modules, providers, and capability contracts rather than a single giant app.

### 4. Privacy-preserving collaboration

The system should support safe collaboration and community contribution without defaulting to centralized surveillance.

### 5. Practical, not magical

LifeOS should focus on buildable systems, explicit contracts, bounded autonomy, and honest tradeoffs.

### 6. Open ecosystem

This is open-source software. People should be able to build their own modules, providers, adapters, and features to fulfill capabilities inside a stable platform contract.

---

## What Phase 1 Is

Phase 1 is the **foundation**.

It is the stage where we define and build the minimum viable platform for a Personal AI Node, including:

- local reasoning and planning
- the Life Graph
- the Goal Engine
- the event architecture
- modular schema extensions
- dependency-aware modules
- runtime profiles
- permissions and policy boundaries
- docs, contracts, and contributor guidance

Phase 1 is about making the platform **real, understandable, and extensible**.

---

## Phase 1 Focus

### Reasoning

Interpret requests, plan work, and coordinate actions locally.

### Life Graph

Model goals, projects, tasks, people, resources, opportunities, and events.

### Automation

React to events and orchestrate local systems safely.

### Modules

Extend the node into domains such as home, health, learning, communications, and small-scale production.

### Open capability system

Allow the community to build providers and features that fulfill platform capabilities without hardcoding one implementation.

---

## Reference Phase 1 Capabilities

The current reference direction includes:

- room-aware automation and follow-me media
- AI receptionist and voice interaction
- production and personal economic planning modules
- fitness, health, and social coordination modules
- bounded scenario simulation on local data
- dependency-aware modules with recommended runtime profiles
- local or swappable providers for LLM, voice, vision, and communications

---

## What LifeOS Could Grow Into

LifeOS is being designed so it can support many different kinds of personal AI use over time, including:

- smart home coordination
- room-aware and person-aware environments
- home-brew AI servers
- local assistant workflows
- production management for small-scale growing or making
- personal economic planning
- fitness and health modules
- music, hobby, and learning modules
- open provider ecosystems
- life simulation and long-horizon planning

Not every installation needs all of this.

A lightweight server might only run:

- the core runtime
- the life graph
- the goal engine
- calendar/email integration
- a few planning modules

A more advanced install might add:

- local LLMs
- voice interaction
- visual ingestion
- room awareness
- SIP or phone integration
- production and inventory modules

That flexibility is a design goal.

---

## Start Here

- Get started with [local setup](docs/SETUP.md)
- Read the [documentation index](docs/README.md)
- Review the [Phase 1 landing page](docs/phase-1/README.md)
- Review the [Phase 1 reference architecture](docs/phase-1/reference-architecture.md)
- See the [contributor guide](docs/CONTRIBUTING.md)
- Explore the [contributor map](docs/community/contributor-map.md)

---

## Repository Status

This repository is currently **docs-first**.

Infrastructure runtime note: wrappers under `services/nats`, `services/opa`, `services/postgres`, `services/life-graph-db`, `services/otel-collector`, `services/tempo`, and `services/grafana` are retired placeholders. Runtime source of truth for these components is the official images declared in `docker-compose.yml`.

That means the primary deliverables right now are:

- architecture documents
- contracts and schemas
- contributor-facing design guidance
- implementation planning for Phase 1

The purpose of this stage is alignment.

We want contributors to build toward the **same system**, not just adjacent ideas.

---

## Who Should Contribute?

You do **not** need to fit into one narrow role to contribute to LifeOS.

Contributors may include:

- systems architects
- backend developers
- local AI / inference engineers
- home automation builders
- graph and event-driven system designers
- security and policy engineers
- UX and product designers
- documentation writers
- module authors for domains like health, farming, music, education, and communications

If you care about **decentralized AI for life improvements**, there is room for you here.

---

## Contribution Direction

We welcome contributors who want to help shape:

- the Personal AI Node
- the Life Graph
- the Goal Engine
- the Event Architecture
- the AI Agent Mesh
- module and provider contracts
- runtime profiles and dependency resolution
- safe autonomy and approval flows
- docs that make the system understandable to others

If you want to build a module, provider, adapter, or implementation path for a capability, that is not just allowed — it is part of the intended architecture.

---

## Design Philosophy

LifeOS should be:

- **powerful enough** to coordinate meaningful work
- **bounded enough** to remain safe and understandable
- **modular enough** to support many kinds of users
- **open enough** for a community ecosystem
- **practical enough** to run on real home-brew hardware

We are not trying to build an all-knowing black box.

We are trying to build an **open, local-first AI foundation for real life improvement**.

---

## Join the Project

If this vision resonates with you, join us.

Help define the architecture.  
Help test the assumptions.  
Help build the modules.  
Help improve the docs.  
Help make personal AI more open, local, modular, and human-centered.

**Join us in growing decentralized AI for life improvements.**

---

## Quick Links

- [Setup Guide](docs/SETUP.md)
- [Docs Index](docs/README.md)
- [Phase 1 Overview](docs/phase-1/README.md)
- [Reference Architecture](docs/phase-1/reference-architecture.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Contributor Map](docs/community/contributor-map.md)

---

## License

See [LICENSE](LICENSE) for details.
