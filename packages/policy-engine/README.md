# @lifeos/policy-engine

Policy evaluation contracts for permission checks and authorization decisions.

Current implementation provides a strict local evaluator for:

- module manifest permission checks (`module.load` on `lifeos.module`)
- scope-based permission checks via `checkPermission()`
- fail-closed deny behavior for unknown or malformed requests

Trusted wildcard subscriptions are limited to system modules (for example `orchestrator` and `sync-core`).

## Spec References

- [Module Interface Specification](../../docs/architecture/module-system.md)
- [Event Architecture Specification](../../docs/architecture/event-model.md)
