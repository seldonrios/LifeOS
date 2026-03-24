import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

import {
  GOOGLE_BRIDGE_SUBFEATURES,
  getEnabledGoogleBridgeSubFeatures,
  type GoogleBridgeSubFeature,
} from './config';
import { authorizeGoogleBridge, getGoogleAccessToken } from './oauth';
import { syncGoogleCalendar } from './sync/calendar';
import { syncGmailUnreadMessages } from './sync/gmail';
import { syncGoogleTasks } from './sync/tasks';

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

  return {
    id: 'google-bridge',
    async init(context: ModuleRuntimeContext): Promise<void> {
      const enabled = await getEnabledGoogleBridgeSubFeatures({ env: context.env });
      if (enabled.length === 0) {
        context.log(
          '[GoogleBridge] Loaded with no sub-features enabled. Use: lifeos module enable google-bridge --sub calendar,tasks,gmail',
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
