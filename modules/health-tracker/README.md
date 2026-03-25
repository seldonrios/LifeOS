# health-tracker

A local-first community module for logging daily health metrics (steps, sleep, weight, heart rate, and custom values).

## Events

- Subscribe: `lifeos.voice.intent.health.log`
- Subscribe: `lifeos.voice.intent.health.query`
- Subscribe: `lifeos.tick.overdue`
- Publish: `lifeos.health.metric.logged`
- Publish: `lifeos.health.streak.updated`
- Publish: `lifeos.orchestrator.suggestion` (reminder/query summaries)

## Development

Run tests from workspace root:

```bash
pnpm exec tsx --test modules/health-tracker/src/index.test.ts
```
