import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

import {
  GOOGLE_BRIDGE_SUBFEATURES,
  getEnabledGoogleBridgeSubFeatures,
  type GoogleBridgeSubFeature,
} from './config';
import { authorizeGoogleBridge, getGoogleAccessToken } from './oauth';
import { createGoogleCalendarEvent, syncGoogleCalendar } from './sync/calendar';
import { syncGoogleChatMessages } from './sync/chat';
import { syncGoogleContacts } from './sync/contacts';
import { syncGoogleDocs } from './sync/docs';
import { syncGoogleDriveFiles } from './sync/drive';
import { syncGmailUnreadMessages } from './sync/gmail';
import { syncGoogleKeepNotes } from './sync/keep';
import { syncGoogleMeetEvents } from './sync/meet';
import { syncGoogleSheets } from './sync/sheets';
import { createGoogleTaskFromVoice, syncGoogleTasks } from './sync/tasks';

export {
  GOOGLE_BRIDGE_SUBFEATURES,
  getEnabledGoogleBridgeSubFeatures,
  setEnabledGoogleBridgeSubFeatures,
  updateGoogleBridgeSubFeatures,
  parseGoogleBridgeSubFeatures,
  type GoogleBridgeSubFeature,
} from './config';
export { authorizeGoogleBridge } from './oauth';

const DEFAULT_SYNC_INTERVAL_MS = 10 * 60 * 1000;

interface SyncRequestPayload {
  subFeatures?: unknown;
  source?: unknown;
}

export interface GoogleBridgeModuleOptions {
  now?: () => Date;
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function createClient(context: ModuleRuntimeContext): LifeGraphClient {
  return context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
}

function resolveSyncIntervalMs(context: ModuleRuntimeContext): number {
  const raw = Number.parseInt(context.env.LIFEOS_GOOGLE_SYNC_INTERVAL_MS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SYNC_INTERVAL_MS;
  }
  return raw;
}

function normalizeFeatureArray(value: unknown): GoogleBridgeSubFeature[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const valid = new Set(GOOGLE_BRIDGE_SUBFEATURES);
  const parsed = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry): entry is GoogleBridgeSubFeature => valid.has(entry as GoogleBridgeSubFeature));
  return [...new Set(parsed)];
}

function selectFeatures(
  enabled: GoogleBridgeSubFeature[],
  requested?: GoogleBridgeSubFeature[],
): GoogleBridgeSubFeature[] {
  if (!requested || requested.length === 0) {
    return enabled;
  }
  const enabledSet = new Set(enabled);
  return requested.filter((feature) => enabledSet.has(feature));
}

async function publishSyncSummary(
  context: ModuleRuntimeContext,
  payload: {
    requested: GoogleBridgeSubFeature[];
    synchronized: Record<string, number>;
    syncedAt: string;
    source: string;
  },
): Promise<void> {
  await context.publish('lifeos.bridge.google.sync.completed', payload, 'google-bridge');
}

export function createGoogleBridgeModule(options: GoogleBridgeModuleOptions = {}): LifeOSModule {
  const now = options.now ?? (() => new Date());
  const lastSyncAtMs = new Map<GoogleBridgeSubFeature, number>();
  let feedbackSpeakerPromise: Promise<{ speak: (text: string) => Promise<void> } | null> | null =
    null;

  async function runSync(
    context: ModuleRuntimeContext,
    reason: string,
    requestedFeatures?: GoogleBridgeSubFeature[],
    force = false,
  ): Promise<void> {
    const enabled = await getEnabledGoogleBridgeSubFeatures({ env: context.env });
    const features = selectFeatures(enabled, requestedFeatures);
    if (features.length === 0) {
      context.log('[GoogleBridge] No sub-features enabled, skipping sync.');
      return;
    }

    const syncIntervalMs = resolveSyncIntervalMs(context);
    const timestampMs = now().getTime();
    const toSync = features.filter((feature) => {
      if (force) {
        return true;
      }
      const previous = lastSyncAtMs.get(feature);
      if (!previous) {
        return true;
      }
      return timestampMs - previous >= syncIntervalMs;
    });
    if (toSync.length === 0) {
      context.log('[GoogleBridge] Sync skipped (throttled).');
      return;
    }

    const client = createClient(context);
    let accessToken = '';
    try {
      accessToken = await getGoogleAccessToken({ env: context.env });
    } catch (error: unknown) {
      context.log(`[GoogleBridge] auth degraded: ${normalizeErrorMessage(error)}`);
      return;
    }

    const synchronized: Record<string, number> = {};
    for (const feature of toSync) {
      try {
        if (feature === 'calendar') {
          const count = await syncGoogleCalendar(context, client, accessToken, now());
          synchronized.calendar = count;
        } else if (feature === 'tasks') {
          const count = await syncGoogleTasks(context, client, accessToken);
          synchronized.tasks = count;
        } else if (feature === 'gmail') {
          const count = await syncGmailUnreadMessages(context, client, accessToken);
          synchronized.gmail = count;
        } else if (feature === 'drive') {
          const count = await syncGoogleDriveFiles(context, client, accessToken);
          synchronized.drive = count;
        } else if (feature === 'contacts') {
          const count = await syncGoogleContacts(context, client, accessToken);
          synchronized.contacts = count;
        } else if (feature === 'keep') {
          const count = await syncGoogleKeepNotes(context, client, accessToken);
          synchronized.keep = count;
        } else if (feature === 'chat') {
          const count = await syncGoogleChatMessages(context, client, accessToken);
          synchronized.chat = count;
        } else if (feature === 'meet') {
          const count = await syncGoogleMeetEvents(context, client, accessToken, now());
          synchronized.meet = count;
        } else if (feature === 'docs') {
          const count = await syncGoogleDocs(context, client, accessToken);
          synchronized.docs = count;
        } else if (feature === 'sheets') {
          const count = await syncGoogleSheets(context, client, accessToken);
          synchronized.sheets = count;
        } else {
          synchronized[feature] = 0;
          context.log(`[GoogleBridge] ${feature} is enabled but not implemented yet.`);
        }
        lastSyncAtMs.set(feature, timestampMs);
      } catch (error: unknown) {
        context.log(
          `[GoogleBridge] ${feature} sync degraded (${reason}): ${normalizeErrorMessage(error)}`,
        );
      }
    }

    await publishSyncSummary(context, {
      requested: toSync,
      synchronized,
      syncedAt: new Date().toISOString(),
      source: reason,
    });
  }

  async function onTick(_event: BaseEvent<Record<string, unknown>>, context: ModuleRuntimeContext) {
    await runSync(context, 'tick');
  }

  async function onSyncRequest(
    event: BaseEvent<SyncRequestPayload>,
    context: ModuleRuntimeContext,
  ): Promise<void> {
    const requested = normalizeFeatureArray(event.data.subFeatures);
    await runSync(context, String(event.data.source ?? 'manual_request'), requested, true);
  }

  async function getFeedbackSpeaker(
    context: ModuleRuntimeContext,
  ): Promise<{ speak: (text: string) => Promise<void> } | null> {
    const spokenFeedbackEnabled = normalizeBooleanFlag(
      context.env.LIFEOS_GOOGLE_BRIDGE_SPOKEN_FEEDBACK,
      true,
    );
    if (!spokenFeedbackEnabled) {
      return null;
    }
    if (!feedbackSpeakerPromise) {
      feedbackSpeakerPromise = (async () => {
        try {
          const voiceCore = (await import('@lifeos/voice-core')) as {
            TextToSpeech?: new () => { speak: (text: string) => Promise<void> };
          };
          if (!voiceCore.TextToSpeech) {
            return null;
          }
          return new voiceCore.TextToSpeech();
        } catch {
          return null;
        }
      })();
    }
    return feedbackSpeakerPromise;
  }

  async function publishUserFeedback(
    context: ModuleRuntimeContext,
    responseText: string,
    action: string,
    utterance: string,
  ): Promise<void> {
    try {
      await context.publish(
        Topics.lifeos.voiceCommandProcessed,
        {
          action,
          responseText,
          text: utterance,
          source: 'google-bridge',
          processedAt: now().toISOString(),
        },
        'google-bridge',
      );
    } catch (error: unknown) {
      context.log(`[GoogleBridge] feedback publish degraded: ${normalizeErrorMessage(error)}`);
    }

    try {
      const speaker = await getFeedbackSpeaker(context);
      if (speaker) {
        await speaker.speak(responseText);
      }
    } catch (error: unknown) {
      context.log(`[GoogleBridge] spoken feedback degraded: ${normalizeErrorMessage(error)}`);
    }
  }

  return {
    id: 'google-bridge',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const enabled = await getEnabledGoogleBridgeSubFeatures({ env: context.env });
      const enabledSet = new Set(enabled);
      if (enabled.length === 0) {
        context.log(
          '[GoogleBridge] Loaded with no sub-features enabled. Use: lifeos module enable google-bridge --sub calendar,tasks,gmail,drive,contacts,keep,chat,meet,docs,sheets',
        );
      } else {
        context.log(`[GoogleBridge] Enabled sub-features: ${enabled.join(', ')}`);
      }

      await context.subscribe<Record<string, unknown>>('lifeos.tick', async (event) => {
        await onTick(event, context);
      });
      await context.subscribe<Record<string, unknown>>(Topics.lifeos.tickOverdue, async (event) => {
        await onTick(event, context);
      });

      await context.subscribe<SyncRequestPayload>(
        'lifeos.bridge.google.sync.requested',
        async (event) => {
          await onSyncRequest(event, context);
        },
      );

      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentCalendarAdd,
        async (event) => {
          if (!enabledSet.has('calendar')) {
            return;
          }
          let accessToken = '';
          try {
            accessToken = await getGoogleAccessToken({ env: context.env });
          } catch (error: unknown) {
            context.log(
              `[GoogleBridge] calendar create auth degraded: ${normalizeErrorMessage(error)}`,
            );
            await context.publish(
              'lifeos.bridge.google.calendar.create_failed',
              {
                reason: 'auth_unavailable',
                requestedAt: now().toISOString(),
              },
              'google-bridge',
            );
            return;
          }

          try {
            const created = await createGoogleCalendarEvent(context, accessToken, event.data);
            if (!created) {
              await publishUserFeedback(
                context,
                'I could not create that calendar event because required fields were missing.',
                'google_calendar_create_invalid',
                (typeof event.data.utterance === 'string' && event.data.utterance) || '',
              );
              return;
            }
            await publishUserFeedback(
              context,
              `Event "${created.title}" created in Google Calendar.`,
              'google_calendar_created',
              (typeof event.data.utterance === 'string' && event.data.utterance) || created.title,
            );
          } catch (error: unknown) {
            context.log(`[GoogleBridge] calendar create degraded: ${normalizeErrorMessage(error)}`);
            await context.publish(
              'lifeos.bridge.google.calendar.create_failed',
              {
                reason: normalizeErrorMessage(error),
                requestedAt: now().toISOString(),
              },
              'google-bridge',
            );
            await publishUserFeedback(
              context,
              'Failed to create the event in Google Calendar.',
              'google_calendar_create_failed',
              (typeof event.data.utterance === 'string' && event.data.utterance) || '',
            );
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentTaskAdd,
        async (event) => {
          if (!enabledSet.has('tasks')) {
            return;
          }
          let accessToken = '';
          try {
            accessToken = await getGoogleAccessToken({ env: context.env });
          } catch (error: unknown) {
            context.log(
              `[GoogleBridge] task create auth degraded: ${normalizeErrorMessage(error)}`,
            );
            await context.publish(
              'lifeos.bridge.google.tasks.create_failed',
              {
                reason: 'auth_unavailable',
                requestedAt: now().toISOString(),
              },
              'google-bridge',
            );
            return;
          }

          try {
            const created = await createGoogleTaskFromVoice(context, accessToken, event.data);
            if (!created) {
              await publishUserFeedback(
                context,
                'I could not create that Google Task because the task title was missing.',
                'google_tasks_create_invalid',
                (typeof event.data.utterance === 'string' && event.data.utterance) || '',
              );
              return;
            }
            await publishUserFeedback(
              context,
              `Task "${created.title}" created in Google Tasks.`,
              'google_tasks_created',
              (typeof event.data.utterance === 'string' && event.data.utterance) || created.title,
            );
          } catch (error: unknown) {
            context.log(`[GoogleBridge] task create degraded: ${normalizeErrorMessage(error)}`);
            await context.publish(
              'lifeos.bridge.google.tasks.create_failed',
              {
                reason: normalizeErrorMessage(error),
                requestedAt: now().toISOString(),
              },
              'google-bridge',
            );
            await publishUserFeedback(
              context,
              'Failed to create the task in Google Tasks.',
              'google_tasks_create_failed',
              (typeof event.data.utterance === 'string' && event.data.utterance) || '',
            );
          }
        },
      );

      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceCommandProcessed,
        async (event) => {
          const utterance =
            typeof event.data.text === 'string' ? event.data.text.toLowerCase() : '';
          if (!utterance.includes('google') || !utterance.includes('sync')) {
            return;
          }
          await runSync(context, 'voice_command', undefined, true);
        },
      );
    },
  };
}

export const googleBridgeModule = createGoogleBridgeModule();

export async function authorizeGoogleBridgeModule(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await authorizeGoogleBridge({ env });
}
