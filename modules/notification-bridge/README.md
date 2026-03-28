# notification-bridge

Reference module that forwards selected `lifeos.*` events to a webhook endpoint.

## Demonstrates

- Configurable subscription topics
- Event-driven external webhook push
- Runtime hook behavior for success/failure publication
- Upgrade-safe env-based configuration defaults

## Configuration

- `LIFEOS_NOTIFICATION_BRIDGE_WEBHOOK`: target webhook URL
- `LIFEOS_NOTIFICATION_BRIDGE_TOPICS`: comma-separated topic list

## Published topics

- `lifeos.notification-bridge.sent`
- `lifeos.notification-bridge.failed`
