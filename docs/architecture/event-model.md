# Event Model

## Purpose

Define the event-based coordination concept that links reasoning, automation, modules, and integrations in Phase 1.

The event model is the shared language of change inside the Personal AI Node.

## Example Events

- `calendar_event_detected`
- `inventory_low`
- `user_entered_room`
- `plant_harvest_ready`
- `incoming_call_detected`
- `sleep_recovery_low`
- `media_handoff_requested`

## Event Roles

- Integrations publish events from external systems.
- Automations subscribe to events and trigger workflows.
- Modules emit and consume domain-specific events.
- The reasoning layer can interpret events as context for decisions.

## Event Families

- presence and room-awareness events
- communication and telephony events
- production and inventory events
- health and fitness events
- calendar and planning events
- media and display events

## Phase 1 Value

Even with only a bounded local agent mesh, an event model provides a clean way to connect capabilities without tight coupling.
