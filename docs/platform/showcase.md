# Module Showcase

## planning-assistant

- Purpose: Personal planning assistant with goal decomposition, scheduling, and graph writes.
- Demonstrates: task decomposition hooks, tick/task event subscriptions, reminder publishing.
- Compatibility: LifeOS CLI 0.1.x (bounded by module manifest requires).
- Install: copy into `modules/planning-assistant`, run validation, enable module.
- Support status: Reference implementation.

## notification-bridge

- Purpose: Event-driven webhook bridge for notifications.
- Demonstrates: topic subscription fan-in, webhook delivery, success/failure event publication.
- Compatibility: LifeOS CLI 0.1.x (bounded by module manifest requires).
- Install: configure webhook in env, validate manifest, enable module.
- Support status: Reference implementation.

## habit-streak

- Purpose: Habit tracking and streak maintenance with voice intents.
- Demonstrates: module schema registration, streak data modeling, intent handling.
- Compatibility: LifeOS CLI 0.1.x (bounded by module manifest requires).
- Install: included in repository, validate and enable as optional module.
- Support status: Reference implementation.
