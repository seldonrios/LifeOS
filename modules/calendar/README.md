# calendar

Purpose: Convert goals and task updates into executable schedules and reminders.

Event subscriptions:

- goal.updated
- task.scheduled
- task.status.changed

Event emissions:

- task.scheduled
- automation.trigger.fired

Agent role:

- Maintain event and reminder records.
- Emit scheduling actions for downstream automation services.

Profile support:

- minimal
- assistant
- ambient
- multimodal
- production

Degraded behavior:

- If comms.email is unavailable, reminders remain in-app only.
