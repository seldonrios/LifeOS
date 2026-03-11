# vision-ingestion-lite

Purpose: Process camera captures and emit analysis-ready automation events.

Event subscriptions:

- automation.trigger.fired
- device.state.changed

Event emissions:

- automation.action.executed
- agent.work.completed

Agent role:

- Coordinate image capture and analysis pipelines.
- Publish completed work events for dependent modules.

Profile support:

- ambient
- multimodal
- production

Degraded behavior:

- If compute.gpu.cuda is unavailable, inference runs in slower CPU mode.
