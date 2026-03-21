# Threat Model

## Purpose

Define the future threat model for LifeOS so security work can grow alongside the local-first, modular, and optionally networked architecture.

## Status

This document is forward-looking. It describes the security assumptions and risks LifeOS should design against as the Personal AI Node matures, especially once remote agents, external providers, and richer automation are added.

## Security Goal

LifeOS should remain useful without requiring blind trust in cloud services, third-party modules, or unverified model output.

## Primary Assets

The system should treat the following as security-sensitive:

- life-graph data about goals, relationships, tasks, routines, and resources
- credentials, API tokens, signing keys, and provider secrets
- module permissions, automation policies, and approval rules
- voice, media, sensor, and device-derived context
- execution authority over local services, files, schedules, and connected systems

## Trust Model

LifeOS is not a single trust domain. It should be designed as a set of boundaries:

- the local node is more trusted than remote services by default
- each module should be treated as partially trusted unless explicitly reviewed
- model output is untrusted until checked against policy, permissions, and context
- external APIs are trusted only for the capability they provide, not for broad authority over the node
- future remote agents should be treated as separate principals with constrained scope

## Local Vs Remote Attack Surfaces

LifeOS is local-first, but local-first does not mean low-risk. The local node still exposes valuable attack surfaces:

- local web dashboards or operator interfaces
- local service-to-service traffic on the event bus or API layer
- file system access to prompts, memory, logs, and secrets
- device integrations such as microphones, cameras, home automation bridges, and local databases
- container breakout or privilege escalation across services on the same host

Remote and semi-remote surfaces expand that risk:

- remote administration paths such as VPN, reverse proxy, or tunneled control planes
- cloud LLM, speech, messaging, or calendar providers
- webhooks and inbound API integrations
- future remote agent communication between nodes or delegated workers
- package and model supply chain dependencies pulled from external registries

The design target should be clear separation between "can observe", "can suggest", and "can execute".

## Module Isolation Risks

The module system is one of the main architectural strengths of LifeOS, but it is also one of the main security risks if boundaries are weak.

Primary risks include:

- a module gaining access to data outside its declared domain
- a module subscribing to events that reveal more context than necessary
- indirect privilege escalation through shared services or helper modules
- unsafe composition where one low-trust module triggers a higher-trust automation path
- secret reuse across modules instead of per-module credentials
- unclear degraded-mode behavior that bypasses normal controls during provider failure

The target posture should include:

- least-privilege permissions per module
- explicit event and API contracts
- auditable module manifests and capability declarations
- sandboxing or process isolation for untrusted modules where practical
- approval gates for high-impact actions

## AI Prompt Injection Vectors

LifeOS will ingest untrusted content from users, messages, notes, web content, calendar events, emails, transcripts, and future multimodal sources. That creates direct prompt injection risk.

Important vectors include:

- instructions embedded in emails, documents, or scraped pages
- hostile content passed through connectors into planning or memory pipelines
- transcript content that attempts to override policy or impersonate the user
- tool results that contain hidden or misleading instructions for later model calls
- cross-module contamination where one module stores poisoned context that another module later trusts

The core assumption should be that retrieved or generated text is data, not authority.

Mitigations should include:

- separating system policy from retrieved context
- tagging provenance for memory, events, and tool outputs
- minimizing prompt surfaces shared across modules
- requiring explicit policy checks before tool use or write actions
- preserving audit trails for why an action was proposed or executed

## API Trust Boundaries

LifeOS will depend on internal APIs, local service interfaces, and external provider APIs. Those boundaries need stronger definitions than "the caller is inside the stack".

Key trust-boundary rules:

- internal APIs should authenticate callers, even on a local network
- event emitters should not automatically gain permission to execute side effects
- write-capable APIs should enforce policy separately from model reasoning
- provider adapters should constrain response formats and sanitize returned content
- inbound webhooks should be authenticated, replay-resistant, and scoped to a narrow action surface
- remote agents and external tools should receive short-lived, task-scoped credentials when possible

## Design Implications

This threat model implies several architectural priorities:

- zero-trust assumptions between services, even on one machine
- strong separation between reasoning, policy, and execution
- capability-based permissions for modules and agents
- provenance tracking for memory, events, prompts, and tool outputs
- explicit human approval for sensitive actions
- security review as part of adding new modules, providers, and remote collaboration features

## Open Questions

Future design work should answer at least these questions:

1. What is the minimum isolation boundary for an untrusted module: process, container, VM, or policy-only?
2. How are remote agents identified, authenticated, and limited when they act on behalf of a local node?
3. Which actions always require human approval, regardless of model confidence?
4. How is prompt and memory provenance preserved across event-driven workflows?
5. What audit format is sufficient to reconstruct why the system executed a sensitive action?

## Related Docs

- [Security and Privacy](../architecture/security-and-privacy.md)
- [Module System](../architecture/module-system.md)
- [Event Model](../architecture/event-model.md)
- [Integrations](../architecture/integrations.md)
- [Privacy and Sovereignty](../concepts/privacy-and-sovereignty.md)
