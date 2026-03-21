# Current Modules

[Back to Home](Home.md)

The current module set gives a useful glimpse of where LifeOS is heading. These are still early modules, but together they show the intended pattern: domain-focused behavior built around events, profiles, and bounded responsibilities.

## Voice

The voice module handles speech-first orchestration.

- purpose: interpret spoken requests and fulfill them through event-driven workflows
- main events: subscribes to `agent.work.requested` and `automation.trigger.fired`; emits `agent.work.completed` and `automation.action.executed`
- profiles: `multimodal`, `production`
- degraded behavior: disables itself if speech-to-text is unavailable

## Calendar

The calendar module turns goals and task updates into schedules and reminders.

- purpose: maintain planning and reminder flows connected to goals and tasks
- main events: subscribes to `goal.updated`, `task.scheduled`, and `task.status.changed`; emits `task.scheduled` and `automation.trigger.fired`
- profiles: `minimal`, `assistant`, `ambient`, `multimodal`, `production`
- degraded behavior: reminders remain in-app only if email capability is unavailable

## Fitness

The fitness module translates health signals and goals into practical activity guidance.

- purpose: produce lightweight workout and recovery planning actions
- main events: subscribes to `health.changed`, `goal.updated`, and `task.status.changed`; emits `health.changed` and `goal.updated`
- profiles: `assistant`, `ambient`, `multimodal`, `production`
- degraded behavior: falls back to rule-based suggestions if chat inference is unavailable

## Economics Lite

The economics module focuses on lightweight planning around budgets and income.

- purpose: track budgets, income streams, and opportunity-oriented planning
- main events: subscribes to `goal.updated`, `task.status.changed`, and `automation.trigger.fired`; emits `goal.updated` and `plan.created`
- profiles: `assistant`, `ambient`, `production`
- degraded behavior: assisted analysis drops away if chat inference is unavailable

## Homesteading Lite

The homesteading module supports small-scale home production workflows.

- purpose: translate seasonal or household production goals into manageable tasks
- main events: subscribes to `automation.trigger.fired` and `goal.updated`; emits `production.task.created` and `automation.action.executed`
- profiles: `assistant`, `ambient`, `production`
- degraded behavior: weather-driven automation is disabled if forecast service support is unavailable

## Vision Ingestion Lite

The vision ingestion module handles image-processing oriented automation inputs.

- purpose: coordinate image capture and analysis pipelines
- main events: subscribes to `automation.trigger.fired` and `device.state.changed`; emits `automation.action.executed` and `agent.work.completed`
- profiles: `ambient`, `multimodal`, `production`
- degraded behavior: continues in slower CPU mode when GPU acceleration is unavailable

## Read Next

- [How Modules Work](How-Modules-Work.md)
- [Architecture Overview](Architecture-Overview.md)
- [Modules Directory](../../modules)
- [Phase 1 Use Cases](../phase-1/use-cases.md)
