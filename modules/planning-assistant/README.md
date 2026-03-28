# planning-assistant

Reference module demonstrating personal planning assistant behavior.

## Demonstrates

- Goal/task planning hooks using event subscriptions
- Life Graph read/write via `loadGraph` and `saveGraph`
- Scheduled reminder publication
- User-facing config schema and env-based config

## Topics

- Subscribes: `lifeos.tick.overdue`, `lifeos.task.completed`
- Publishes: `lifeos.planning-assistant.task.planned`, `lifeos.planning-assistant.reminder.scheduled`, `lifeos.planning-assistant.plan.updated`
