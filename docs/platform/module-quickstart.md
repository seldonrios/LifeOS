# Module Quickstart

## What is a module?

A module is an event-driven extension that subscribes to LifeOS topics, performs work, and can persist state to the Life Graph.

## Scaffold from template

Create module structure from `templates/module/` and customize:

- `lifeos.json`
- `package.json`
- `src/index.ts`
- `src/index.test.ts`

## Run and test locally

- Run tests for your module package.
- Validate manifest: `pnpm lifeos module validate <module-name>`.

## Validate and submit

- Ensure `requires` ranges are compatible with current CLI version.
- Submit with README, migration notes (if needed), and compatibility details.

## Minimal example

```ts
import type { LifeOSModule } from '@lifeos/module-sdk';

export const quickstartModule: LifeOSModule = {
  id: 'quickstart-module',
  async init(context) {
    await context.subscribe('lifeos.tick.overdue', async () => {
      await context.publish('lifeos.quickstart-module.ping', { ok: true }, 'quickstart-module');
    });
  },
};
```
