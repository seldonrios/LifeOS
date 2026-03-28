# Platform Contract Inventory

Current baseline versions in this repository are listed below.

| Surface | Location | Owner | Stability | Version |
| --- | --- | --- | --- | --- |
| CLI commands and flags | `packages/cli/src/index.ts` | CLI maintainers | stable | 0.1.0 CLI API |
| `Topics.lifeos.*` event names | `packages/event-bus/src/types.ts` | Event Bus maintainers | stable | 0.1.0 event contract |
| `LifeGraphDocument` and sub-schemas | `packages/life-graph/src/types.ts` | Life Graph maintainers | stable | 0.1.0 graph schema |
| Module manifest fields (`lifeos.json`) | `packages/module-loader/src/manifest.ts` | Module platform maintainers | stable | 0.1.0 manifest schema |
| `LifeOSModule` / `ModuleRuntimeContext` | `packages/module-loader/src/loader.ts` | Runtime/Module Loader maintainers | stable | 0.1.0 module runtime |
| `@lifeos/event-bus` package exports | `packages/event-bus/src/index.ts` | Event Bus maintainers | stable | 0.1.0 |
| `@lifeos/life-graph` package exports | `packages/life-graph/src/index.ts` | Life Graph maintainers | stable | 0.1.0 |
| `@lifeos/module-loader` package exports | `packages/module-loader/src/index.ts` | Runtime/Module Loader maintainers | stable | 0.1.0 |

## Stability categories

- `stable`: Public contract. Breaking changes require RFC + migration notes.
- `experimental`: Public but evolving. Can change with explicit release notes.
- `internal`: Not for external consumers; no compatibility guarantee.
