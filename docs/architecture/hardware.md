# Hardware Profile

## Purpose

Describe the realistic home-server hardware class that the Phase 1 reference architecture assumes.

## Reference Server

- CPU: high-core-count desktop processor such as an AMD Ryzen 9 7950X or Intel i9-14900K
- RAM: 64-128 GB
- GPU: optional but strongly recommended, such as an NVIDIA RTX 4080 or RTX 4090
- Storage: 4 TB NVMe with optional NAS for bulk storage
- Network: 2.5G or 10G ethernet, plus modern WiFi for device density

## Why This Profile

- CPU supports parallel agents, voice processing, automations, and data services.
- RAM supports local model inference, graph databases, and simulation workloads.
- GPU accelerates local language, speech, and vision models.
- Fast storage supports event history, sensor logs, media state, and graph data.
- Network bandwidth matters for camera feeds, media routing, and dense smart-home traffic.

## Phase 1 Position

This is a reference target, not a hard requirement. LifeOS should remain conceptually portable, but the docs should assume a serious home-lab machine so the design stays realistic.

---

## Concrete Build Guidance

For practical purchasing and deployment decisions, see [Infrastructure Bill of Materials](./infrastructure-bom.md), which provides three budget-tiered BOMs with rationale:

1. **Budget Build** (~$900) — single mini PC, UPS, backup disk
2. **Recommended Build** (~$2,500) — mini PC + NAS with RAID + rotation backup
3. **Privacy-Max Build** (~$4,850) — gaming desktop with GPU + full NAS setup for local AI

Each tier explains trade-offs, cost drivers, and when to upgrade.
