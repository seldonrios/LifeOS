# Security and Privacy

## Purpose

Describe the concrete Phase 1 protections required for a local system that holds highly personal and operational data.

## Related Security Work

- [Threat Model](../security/threat-model.md)

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

## Current-State vs Future Hardening

The controls listed above reflect the current Phase 3 MVP security posture.

Deferred post-MVP hardening items include:

- OS keystore integration for secret encryption at rest (P9-10). Today, secrets are stored as plaintext JSON with `0o600` file permissions on Linux/macOS; Windows does not receive equivalent hardening.
- Trust CLI surface completeness (P9-06). `lifeos trust status` and `lifeos trust report` exist, but output completeness has not been fully verified.
- Dev-mode marketplace trust warnings (P9-09). Visible install-time warnings for unverified catalog sources are a follow-on item; current trust mode behavior is documented in [docs/architecture/marketplace-trust-contract-v1.md](marketplace-trust-contract-v1.md).

For the canonical current inventory of egress paths, auth methods, and credential locations, see [docs/product/data-exposure-map.md](../product/data-exposure-map.md).
