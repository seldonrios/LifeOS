# homesteading-lite

Purpose: Support lightweight home production and harvesting workflows.

Event subscriptions:

- automation.trigger.fired
- goal.updated

Event emissions:

- production.task.created
- automation.action.executed

Agent role:

- Translate seasonal goals into manageable production tasks.
- Coordinate trigger-based automation for garden and pantry workflows.

Profile support:

- assistant
- ambient
- production

Degraded behavior:

- If service.weather.forecast is unavailable, harvest scheduling automation is disabled.
