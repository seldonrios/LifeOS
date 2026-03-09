# Security and Privacy

## Purpose

Describe the concrete Phase 1 protections required for a local system that holds highly personal and operational data.

## Core Controls

- local processing by default
- encrypted storage where practical
- zero-trust network assumptions between services
- VPN for remote access
- secret handling that does not depend on hard-coded credentials in modules

## Why This Matters

LifeOS may hold life-graph data, voice interactions, health context, production information, and communication history. The security posture has to be part of the architecture, not a later add-on.

## Phase 1 Rule

If a feature requires centralizing sensitive personal data without a strong reason, it is the wrong default for LifeOS.
