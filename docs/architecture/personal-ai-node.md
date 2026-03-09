# Personal AI Node

## Purpose

Define the Personal AI Node as the central system boundary for Phase 1.

The Personal AI Node is a local AI operating layer running on user-controlled infrastructure. It is the unit of deployment, control, and value in Phase 1.

## Responsibilities

- Maintain durable personal context.
- Interpret user intent locally.
- Coordinate local automations and module behavior.
- Integrate with nearby systems and services.
- Preserve a clear ownership boundary around data and behavior.
- Host the reference service stack for reasoning, events, voice, media, and dashboards.

## Deployment Profile

The reference node is a home-lab class server with enough compute for local models, event processing, graph storage, and media or voice services. See [Hardware Profile](hardware.md) and [Reference Stack](reference-stack.md).

## Phase 1 Boundary

The node should be useful without requiring other nodes, cloud control planes, or a global protocol ecosystem. Later collaboration models may emerge from this unit, but they do not define Phase 1 delivery.
