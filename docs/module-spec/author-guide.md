# Module Author Guide

## Module lifecycle

1. `init(context)` runs at module start.
2. Subscribe to relevant topics with `context.subscribe()`.
3. Read/write graph state through `context.createLifeGraphClient()`.
4. Publish outcomes with `context.publish()`.
5. Cleanup in `dispose(context)` when provided.

## Permissions declaration

Declare least-privilege access in `lifeos.json`:

- `permissions.graph`: `read`, `append`, `write`
- `permissions.events`: `subscribe:<topic>` / `publish:<topic>`
- `permissions.network`, `permissions.voice` as needed

## Registering schema

Use module-specific schema registration:

- Create a `ModuleSchema` document
- Call `context.createLifeGraphClient().registerModuleSchema(schema)` during init

## Testing without monorepo internals

- Mock event bus interactions (`subscribe`, `publish`)
- Mock life graph client methods used by your module
- Assert topic handling, published outcomes, and persistence behavior

## Compatibility range declaration

Declare bounded semver requirements in `lifeos.json.requires`, for example:

- `@lifeos/cli@>=0.1.0 <0.2.0`

## Marketplace submission

1. Scaffold from template
2. Fill `lifeos.json`
3. Run `pnpm lifeos module validate <module>`
4. Add marketplace metadata
5. Open PR with compatibility notes and tests
