# Vision Overview

> **Status: future roadmap**
> This document describes the long-term LifeOS vision arc.
> The current release target is Phase 3. See [`docs/product/current-product-contract.md`](../product/current-product-contract.md) for the active MVP contract.

## Purpose

Explain the problem LifeOS is trying to solve and frame the long-term direction from a personal AI node to a broader cognitive network.

Most AI products are hosted services, siloed assistants, or narrow automation tools. They do not give users durable control over their data, local workflows, or long-term life context.

LifeOS proposes a different starting point: a **Personal AI Node** running on user-controlled hardware. The node is meant to become a stable operating layer for reasoning, knowledge, automation, and domain-specific support across a person's actual life.

The current working interpretation of that vision is a home-brew AI server that can be built with modern open-source tools. It combines local models, an event bus, a life graph, room-aware presence, voice and media services, and specialized modules into a single local system boundary.

The long-term arc is:

1. Personal AI Node
2. Local AI Networks
3. Global cognitive collaboration

That arc matters because local capability should come first. LifeOS does not depend on immediate network effects to be useful. The Phase 1 system should provide standalone value before any decentralized coordination exists.

Phase 1 now assumes more than a thin proof of concept. It is intended to support realistic local capabilities such as bounded agent delegation, scenario simulation, production planning, and multi-surface interaction, while still keeping collaboration between multiple nodes as a later phase.
