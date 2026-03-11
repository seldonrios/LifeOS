# fitness

Purpose: Turn health signals and goals into practical fitness actions.

Event subscriptions:

- health.changed
- goal.updated
- task.status.changed

Event emissions:

- health.changed
- goal.updated

Agent role:

- Observe changes in goals and health telemetry.
- Produce lightweight workout and recovery planning actions.

Profile support:

- assistant
- ambient
- multimodal
- production

Degraded behavior:

- If ai.llm.chat is unavailable, the module emits deterministic rule-based suggestions only.
