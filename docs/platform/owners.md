# Platform Owners

This map defines primary maintainers for core platform surfaces.

| Surface | Owner(s) |
| --- | --- |
| CLI (`packages/cli`) | CLI maintainers |
| Life Graph schema (`packages/life-graph`) | Life Graph maintainers |
| Event Bus contracts (`packages/event-bus`) | Event Bus maintainers |
| Module Loader interface (`packages/module-loader`) | Runtime/Module Loader maintainers |
| Module manifest schema (`packages/module-loader/src/manifest*.{ts,json}`) | Module platform maintainers |
| SDK - mobile (`packages/sdk`) | Mobile SDK maintainers |
| SDK - platform module (`packages/module-sdk`) | Platform SDK maintainers |

## Ownership expectations

- Owners approve breaking changes in their surface.
- Owners ensure migration notes are present for contract changes.
- Owners verify compatibility checks are updated in CI when needed.
