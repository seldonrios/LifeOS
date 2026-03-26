# @lifeos/config

Core configuration contracts for layered environment and file-based configuration.

This package defines the shape of config layers and resolved runtime configuration used across LifeOS services and modules.

Key default posture:

- local LLM enabled by default
- cloud LLM disabled by default (opt-in)
- security policy enforcement and fail-closed behavior enabled by default
- trust/transparency settings available for ownership messaging surfaces

## Spec References

- [Tech Plan Component Architecture](../../docs/phase-1/reference-architecture.md)
- [Config System](../../docs/architecture/overview.md)
