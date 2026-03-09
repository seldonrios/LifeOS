# Phase 1 Reference Architecture

## Purpose

Capture the realistic Phase 1 system shape for a home-brew LifeOS server and route readers into the detailed subsystem documents.

## System Overview

```text
                AI LIFE OPERATING SYSTEM
                         |
         |---------------|---------------|
         |               |               |
   AI Reasoning     Event Bus       Life Graph
         |               |               |
         |---------------|---------------|
                         |
                Agent Mesh (AI Modules)
                         |
      |------------|-------------|-------------|
      |            |             |             |
 Smart Home   Production    Personal Life   Communications
 Automation     Systems        Modules         Systems
```

The Personal AI Node is a local infrastructure platform. Everything meaningful flows through a shared event model and a shared life graph. The event bus carries change. The life graph carries durable context. The reasoning layer and bounded agent mesh decide what to do with both.

## Reference Deployment Posture

- single-node home server first
- Docker Compose as the default deployment approach
- optional later move to Kubernetes only if complexity justifies it
- local processing preferred for language, voice, vision, and planning

## Key Subsystems

- [Hardware Profile](../architecture/hardware.md): the home-server class machine this phase targets.
- [Reference Stack](../architecture/reference-stack.md): the open-source services and deployment posture.
- [Architecture Overview](../architecture/overview.md): how the core components fit together.
- [Voice and Media](../architecture/voice-and-media.md): room awareness, voice pipeline, receptionist, follow-me media, and displays.
- [Security and Privacy](../architecture/security-and-privacy.md): local-first protections for a highly personal system.
- [User Interfaces](../architecture/user-interfaces.md): voice, mobile, dashboard, and terminal surfaces.

## Reference Module Areas

- smart home and room awareness
- production systems such as hydroponics, mushroom growing, 3D printing, or crafts
- personal economic planning
- health and fitness
- communications and receptionist flows
- social and community coordination

## Phase 1 Constraint

This reference architecture is detailed and ambitious, but it is still a single-node local system. Inter-node coordination, global agentic protocols, and large-scale collective intelligence remain outside current delivery scope.
