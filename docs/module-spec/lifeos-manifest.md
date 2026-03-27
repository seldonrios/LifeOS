# LifeOS Module Manifest (`lifeos.json`)

Every marketplace-ready module must include a `lifeos.json` file at:

`modules/<module-name>/lifeos.json`

This manifest is the security contract for module loading, certification, and marketplace listing.

## Required Format

```json
{
  "name": "my-health-tracker",
  "version": "0.1.0",
  "author": "your-github-username",
  "description": "Tracks daily steps and suggests adjustments",
  "permissions": {
    "graph": ["read", "append"],
    "network": ["weather"],
    "voice": ["speak"],
    "events": ["subscribe:lifeos.tick", "publish:lifeos.health.update"]
  },
  "resources": {
    "cpu": "low",
    "memory": "low"
  },
  "subFeatures": ["calendar", "tasks"],
  "graphVersion": "0.1.0",
  "requires": ["@lifeos/voice-core@>=0.3.0 <0.4.0", "@lifeos/life-graph@>=0.3.0 <0.4.0"],
  "category": "health",
  "tags": ["habit", "fitness"]
}
```

Template reference:

- `templates/module/lifeos.json`

## Field Rules

- `name`: lowercase kebab-case module name.
- `version`: semver string (example: `0.1.0`).
- `author`: non-empty owner identifier.
- `permissions`: explicit requested capabilities.
- `resources`: runtime hints used for scheduling and baseline safety (`cpu`, `memory`).
- `subFeatures` (optional): bridge-specific feature toggles (`calendar`, `tasks`, etc.).
- `graphVersion`: required Life Graph schema baseline expected by the module.
- `requires`: required LifeOS package dependencies, each in `@lifeos/<pkg>@<semver-range>` format.
- Before `1.0.0`, prefer bounded ranges for compatibility clarity (example: `>=0.3.0 <0.4.0`).
- `category`: lowercase kebab-case category.
- `tags`: lowercase kebab-case labels.

## Permission Shape

- `permissions.graph`: `read | append | write`
- `permissions.voice`: `speak | listen`
- `permissions.network`: lowercase identifiers (example: `weather`, `news`)
- `permissions.events`: must be `subscribe:<topic>` or `publish:<topic>`
- `resources.cpu`: `low | medium | high`
- `resources.memory`: `low | medium`

## CLI Support

Create module scaffold:

```bash
pnpm lifeos module create my-health-tracker
```

Validate manifest:

```bash
pnpm lifeos module validate my-health-tracker
```

## Loader Enforcement

When `modules/<id>/lifeos.json` exists, `@lifeos/module-loader`:

1. Validates the manifest schema
2. Runs permission checks
3. Rejects unauthorized permission requests

Set `LIFEOS_MODULE_MANIFEST_REQUIRED=true` to require a manifest for every loaded module id.
Set `LIFEOS_MODULE_RUNTIME_PERMISSIONS=strict` to reject runtime publish/subscribe/graph actions that are not declared in the manifest (`warn` by default).
