# Architecture Overview

> **Status: foundation context**
> For the active release architecture boundary, see [Current System Boundary](./current-system-boundary.md).

## Purpose

Describe how the main Phase 1 components of the Personal AI Node fit together.
For current MVP reviews, treat this as foundation context and apply the boundary rules in `current-system-boundary.md`.

## Core Structure

```text
                AI LIFE OPERATING SYSTEM
                         |
         |---------------|---------------|
         |               |               |
   AI Reasoning     Event Bus       Life Graph
         |               |               |
         |---------------|---------------|
                         |
      Local Orchestration Mesh + Modules
                         |
      |------------|-------------|-------------|
      |            |             |             |
 Smart Home   Production    Personal Life   Communications
 Automation     Systems        Modules         Systems
```

## Component Roles

- The reasoning engine interprets requests, plans actions, and coordinates capabilities.
- The event bus moves signals between services, devices, and modules.
- The life graph stores durable personal context and relationships.
- The automation framework reacts to events and executes workflows.
- The local orchestration mesh coordinates bounded runtime delegation and fallback behavior.
- The module system extends the node into specific domains.
- Integrations connect the node to local devices, services, and data sources.

Mesh vocabulary in this document:

- local orchestration mesh: bounded current runtime coordination
- node/federation mesh: optional/future cross-node delegation context
- mesh service: only when referring to a separately deployed service boundary

## Deployment Shape

The reference system is a local micro-service platform, usually on one home server. Docker Compose is the default mental model. Kubernetes is optional later, not required.

Current persistence interpretation for MVP-aligned reads:

- canonical local persistence: SQLite
- documented compatibility fallback: JSON-file adapter
- Postgres/Neo4j and larger stores: optional extended platform stack

## Architectural Priority

The architecture should favor local usefulness, clean boundaries, and future extensibility over speculative completeness.
