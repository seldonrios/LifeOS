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
