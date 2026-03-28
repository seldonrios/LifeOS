# Structured Logging Standard

All platform/runtime logs must be JSON lines and include:

- `timestamp`
- `level`
- `component`
- `moduleId` (when applicable)
- `eventType` (when applicable)
- `errorCode` (when applicable)

## Example

```json
{"timestamp":"2026-03-28T00:00:00.000Z","level":"error","component":"module-loader","moduleId":"habit-streak","eventType":"module.load.failed","errorCode":"manifest-validation","message":"manifest invalid","suggestedFix":"Fix lifeos.json and rerun validation"}
```

## Conventions

- `level`: `debug` | `info` | `warn` | `error`
- Use consistent `errorCode` values for automation.
- Keep `message` human-readable and include `suggestedFix` for actionable failures.
