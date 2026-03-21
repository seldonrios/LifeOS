# How Modules Work

[Back to Home](Home.md)

Modules are how LifeOS grows by domain. Instead of pushing every feature into one large assistant, the system uses modules to add specialized behavior for areas like voice, calendar planning, fitness, homesteading, economics, or vision.

## The Basic Module Shape

In the current code, modules follow a consistent pattern:

- they declare metadata such as id, name, version, and category
- they declare permissions for the capabilities they need
- they subscribe to and emit events
- they participate in a bounded `plan` and `act` loop
- they expose settings and scheduling behavior through module configuration

This gives the platform a shared contract without forcing every module to work the same way internally.

## Permissions And Boundaries

Module permissions are part of the design, not an afterthought. A module may be allowed to publish events, subscribe to events, control devices, invoke language models, or read and write specific systems depending on its role.

That matters because LifeOS is trying to keep autonomy bounded and understandable.

## Events As The Connection Layer

Modules do not need to know everything about one another directly. Instead, they can react to shared topics such as:

- `goal.updated`
- `task.scheduled`
- `task.status.changed`
- `agent.work.requested`
- `automation.trigger.fired`

This lets modules remain specialized while still participating in larger workflows.

## Planning, Acting, And Runtime Profiles

The reasoning-oriented module shape is built around observing state, producing a small plan, and acting on planned work. Modules also declare the profiles they support, such as `minimal`, `assistant`, `ambient`, `multimodal`, or `production`.

This matters because not every installation should run the same stack. Some nodes may stay lightweight, while others enable richer local capabilities.

## Degraded Behavior

Current modules also describe what happens when a required provider is missing.

For example:

- voice can disable itself if speech-to-text is unavailable
- fitness can fall back to deterministic suggestions if chat inference is missing
- vision ingestion can keep working in slower CPU mode if GPU acceleration is unavailable

That is an important part of the platform direction: the system should fail clearly and degrade honestly.

## Read Next

- [Current Modules](Current-Modules.md)
- [Architecture Overview](Architecture-Overview.md)
- [Module System Doc](../architecture/module-system.md)
- [Reasoning Package](../../packages/reasoning/README.md)
