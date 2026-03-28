import { Topics, type LifeOSModule } from '@lifeos/module-sdk';

const DEFAULT_TOPICS = [
  Topics.lifeos.tickOverdue,
  Topics.lifeos.taskCompleted,
  Topics.lifeos.habitCheckinRecorded,
];

function getTopicsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = (env.LIFEOS_NOTIFICATION_BRIDGE_TOPICS ?? '').trim();
  if (!raw) {
    return DEFAULT_TOPICS;
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const notificationBridgeModule: LifeOSModule = {
  id: 'notification-bridge',
  async init(context) {
    const webhookUrl = context.env.LIFEOS_NOTIFICATION_BRIDGE_WEBHOOK?.trim();
    const topics = getTopicsFromEnv(context.env);

    for (const topic of topics) {
      await context.subscribe(topic, async (event) => {
        if (!webhookUrl) {
          await context.publish(
            Topics.lifeos.notificationBridgeFailed,
            {
              reason: 'missing-webhook-url',
              topic,
            },
            'notification-bridge',
          );
          return;
        }

        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              topic: event.type,
              timestamp: event.timestamp,
              source: event.source,
              payload: event.data,
            }),
          });

          if (!response.ok) {
            throw new Error(`webhook returned HTTP ${response.status}`);
          }

          await context.publish(
            Topics.lifeos.notificationBridgeSent,
            {
              topic,
              deliveredAt: new Date().toISOString(),
            },
            'notification-bridge',
          );
        } catch (error: unknown) {
          await context.publish(
            Topics.lifeos.notificationBridgeFailed,
            {
              topic,
              error: error instanceof Error ? error.message : String(error),
            },
            'notification-bridge',
          );
        }
      });
    }
  },
};
