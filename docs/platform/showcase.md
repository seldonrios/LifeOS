# Module Showcase

## planning-assistant

- Purpose: Personal planning assistant with goal decomposition, scheduling, and graph writes.
- Demonstrates: task decomposition hooks, tick/task event subscriptions, reminder publishing.
- Compatibility target: `@lifeos/cli >=0.1.0 <0.2.0` | `@lifeos/module-sdk >=0.1.0 <0.2.0`
- Stable-surface: imports only `@lifeos/module-sdk` public API
- CI validation: passes `lifeos module validate` in module-validate workflow
- Install: copy into `modules/planning-assistant`, run validation, enable module.
- Support status: Reference implementation — graduation gate passed

## notification-bridge

- Purpose: Event-driven webhook bridge for notifications.
- Demonstrates: topic subscription fan-in, webhook delivery, success/failure event publication.
- Compatibility target: `@lifeos/cli >=0.1.0 <0.2.0` | `@lifeos/module-sdk >=0.1.0 <0.2.0`
- Stable-surface: imports only `@lifeos/module-sdk` public API
- CI validation: passes `lifeos module validate` in module-validate workflow
- Install: configure webhook in env, validate manifest, enable module.
- Support status: Reference implementation — graduation gate passed

## habit-streak

- Purpose: Habit tracking and streak maintenance with voice intents.
- Demonstrates: module schema registration, streak data modeling, intent handling.
- Compatibility target: `@lifeos/cli >=0.1.0 <0.2.0` | `@lifeos/module-sdk >=0.1.0 <0.2.0`
- Stable-surface: imports only `@lifeos/module-sdk` public API
- CI validation: passes `lifeos module validate` in module-validate workflow
- Install: included in repository, validate and enable as optional module.
- Support status: Reference implementation — graduation gate passed
