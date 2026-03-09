# Architecture Overview

## Purpose

Describe how the main Phase 1 components of the Personal AI Node fit together.

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
                Agent Mesh (AI Modules)
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
- The bounded agent mesh gives specialization to roles such as concierge, production, communications, or health.
- The module system extends the node into specific domains.
- Integrations connect the node to local devices, services, and data sources.

## Deployment Shape

The reference system is a local micro-service platform, usually on one home server. Docker Compose is the default mental model. Kubernetes is optional later, not required.

## Architectural Priority

The architecture should favor local usefulness, clean boundaries, and future extensibility over speculative completeness.
