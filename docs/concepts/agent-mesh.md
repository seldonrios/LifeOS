# Agent Mesh

## Purpose

Describe the bounded local agent mesh used in the Phase 1 reference architecture and explain how later phases extend it.

The Phase 1 reference architecture uses a pragmatic local agent mesh in which specialized roles coordinate through shared context and events.

## Phase 1 Shape

Possible agent roles include:

- planning
- knowledge
- automation
- communications
- production
- health
- simulation
- concierge

## Relation to Phase 1

Phase 1 should assume bounded specialization, not a fully autonomous swarm. The agent mesh is a coordination pattern inside one local node, built on clear events, durable context, and modular boundaries.

## Future Direction

Later phases can make this mesh more autonomous, more persistent, and more distributed across multiple nodes or services.
