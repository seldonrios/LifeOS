# voice

Purpose: Interpret and fulfill spoken requests through event-driven orchestration.

Event subscriptions:

- agent.work.requested
- automation.trigger.fired

Event emissions:

- agent.work.completed
- automation.action.executed

Agent role:

- Convert voice requests into structured actions.
- Emit completion and automation outcomes for downstream services.

Profile support:

- multimodal
- production

Degraded behavior:

- If media.voice.stt is unavailable, the voice module is disabled.
