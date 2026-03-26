# @lifeos/observability

Observability contracts for traces, metrics, and structured logs.

Current implementation provides a local structured-logging client with:

- span start/end tracking
- metric event logging
- level-based runtime logging (`debug`, `info`, `warn`, `error`)

This baseline is intentionally simple and keeps output inspectable by the user.

## Spec References

- [Tech Plan Component Architecture](../../docs/phase-1/reference-architecture.md)
- [Observability and Telemetry](../../docs/architecture/automation-framework.md)
