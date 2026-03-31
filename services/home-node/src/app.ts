import { randomUUID } from 'node:crypto';

import {
  HomeNodeDisplayFeedEventSchema,
  HomeNodeStateSnapshotUpdatedSchema,
  HouseholdHomeStateChangedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  type HomeNodeSurfaceRegistered,
  type HomeStateSnapshot,
  type HomeNodeStateSnapshotUpdated,
} from '@lifeos/contracts';
import { createEventBusClient, Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import { HomeNodeGraphClient, buildNextSnapshot } from '@lifeos/home-node-core';
import { createEnvSecretStore, startService } from '@lifeos/service-runtime';

import { registerHomeNodeRoutes } from './routes';

const DEFAULT_HOME_ID = 'home-default';
const WATCHDOG_INTERVAL_MS = 60_000;
const SURFACE_INACTIVITY_THRESHOLD_MS = 300_000;

type WatchdogStatus = 'healthy' | 'degraded';

type DisplayFeedSignalWaiter = {
  resolve: (signalVersion: number) => void;
  timeout: NodeJS.Timeout;
};

let graphClient: HomeNodeGraphClient | null = null;
let eventBus: ManagedEventBus | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;
const displayFeedSignalVersions = new Map<string, number>();
const displayFeedSignalWaiters = new Map<string, Set<DisplayFeedSignalWaiter>>();

function getDisplayFeedSignalVersion(householdId: string): number {
  return displayFeedSignalVersions.get(householdId) ?? 0;
}

function signalDisplayFeedUpdated(householdId: string): number {
  const next = getDisplayFeedSignalVersion(householdId) + 1;
  displayFeedSignalVersions.set(householdId, next);

  const waiters = displayFeedSignalWaiters.get(householdId);
  if (waiters) {
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(next);
    }
    displayFeedSignalWaiters.delete(householdId);
  }

  return next;
}

function waitForDisplayFeedSignal(
  householdId: string,
  since: number,
  timeoutMs: number,
): Promise<number> {
  const current = getDisplayFeedSignalVersion(householdId);
  if (current > since) {
    return Promise.resolve(current);
  }

  return new Promise((resolve) => {
    const waiters = displayFeedSignalWaiters.get(householdId) ?? new Set<DisplayFeedSignalWaiter>();
    const waiter: DisplayFeedSignalWaiter = {
      resolve,
      timeout: setTimeout(() => {
        waiters.delete(waiter);
        if (waiters.size === 0) {
          displayFeedSignalWaiters.delete(householdId);
        }

        resolve(getDisplayFeedSignalVersion(householdId));
      }, timeoutMs),
    };

    waiters.add(waiter);
    displayFeedSignalWaiters.set(householdId, waiters);
  });
}

function defaultSnapshot(now: string): HomeStateSnapshot {
  return {
    home_mode: 'home',
    occupancy_summary: 'unknown',
    active_routines: [],
    adapter_health: 'healthy',
    snapshot_at: now,
  };
}

function createEvent<T>(type: string, data: T, householdId: string): BaseEvent<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source: 'home-node-service',
    version: '1',
    data,
    metadata: {
      household_id: householdId,
      trace_id: randomUUID(),
    },
  };
}

export async function publishSnapshotUpdatedEvent(
  activeEventBus: ManagedEventBus,
  householdId: string,
  snapshot: HomeStateSnapshot,
): Promise<void> {
  const data: HomeNodeStateSnapshotUpdated = HomeNodeStateSnapshotUpdatedSchema.parse({
    home_id: DEFAULT_HOME_ID,
    household_id: householdId,
    snapshot,
    updated_at: new Date().toISOString(),
  });

  await activeEventBus.publish(
    Topics.lifeos.homeNodeStateSnapshotUpdated,
    createEvent(Topics.lifeos.homeNodeStateSnapshotUpdated, data, householdId),
  );
}

export async function publishDisplayFeedUpdatedEvent(
  activeEventBus: ManagedEventBus,
  householdId: string,
  homeMode: HomeStateSnapshot['home_mode'],
): Promise<void> {
  const data = HomeNodeDisplayFeedEventSchema.parse({
    household_id: householdId,
    home_id: DEFAULT_HOME_ID,
    home_mode: homeMode,
    updated_at: new Date().toISOString(),
  });

  await activeEventBus.publish(
    Topics.lifeos.homeNodeDisplayFeedUpdated,
    createEvent(Topics.lifeos.homeNodeDisplayFeedUpdated, data, householdId),
  );
}

export async function publishSurfaceRegisteredEvent(
  activeEventBus: ManagedEventBus,
  surface: HomeNodeSurfaceRegistered,
): Promise<void> {
  await activeEventBus.publish(
    Topics.lifeos.homeNodeSurfaceRegistered,
    createEvent(Topics.lifeos.homeNodeSurfaceRegistered, surface, surface.household_id),
  );
}

export async function publishSurfaceDeregisteredEvent(
  activeEventBus: ManagedEventBus,
  surface: HomeNodeSurfaceRegistered,
): Promise<void> {
  const data = {
    ...surface,
    deregistered_at: new Date().toISOString(),
  };

  await activeEventBus.publish(
    Topics.lifeos.homeNodeSurfaceDeregistered,
    createEvent(Topics.lifeos.homeNodeSurfaceDeregistered, data, surface.household_id),
  );
}

export async function handleHomeStateChangedEvent(
  activeGraphClient: HomeNodeGraphClient,
  activeEventBus: ManagedEventBus,
  incomingEvent: BaseEvent<unknown>,
): Promise<void> {
  const payload = HouseholdHomeStateChangedSchema.parse(incomingEvent.data);
  if (!payload.consentVerified) {
    console.info(
      JSON.stringify({
        message: 'home-node skipped home-mode transition because consent is not verified',
        householdId: payload.householdId,
        stateKey: payload.stateKey,
        reason: 'consent_not_verified',
      }),
    );
  }

  const now = new Date().toISOString();
  const current = activeGraphClient.getHomeStateSnapshot(payload.householdId) ?? defaultSnapshot(now);
  const next = buildNextSnapshot(current, payload, now);

  const persisted = activeGraphClient.upsertHomeStateSnapshot({
    householdId: payload.householdId,
    homeMode: next.home_mode,
    occupancySummary: next.occupancy_summary,
    activeRoutines: next.active_routines,
    adapterHealth: next.adapter_health,
    snapshotAt: next.snapshot_at,
  });

  activeGraphClient.appendAmbientAction({
    householdId: payload.householdId,
    triggerType: 'home_state_changed',
    triggerRef: payload.stateKey,
    decisionSource: 'deterministic-rule-engine',
    result: payload.consentVerified ? 'accepted' : 'consent_skip',
  });

  await publishSnapshotUpdatedEvent(activeEventBus, payload.householdId, persisted);

  if (current.home_mode !== persisted.home_mode) {
    await publishDisplayFeedUpdatedEvent(activeEventBus, payload.householdId, persisted.home_mode);
  }
}

export function handleVoiceCaptureEvent(
  activeGraphClient: HomeNodeGraphClient,
  incomingEvent: BaseEvent<unknown>,
): void {
  const payload = HouseholdVoiceCaptureCreatedSchema.parse(incomingEvent.data);
  activeGraphClient.appendAmbientAction({
    householdId: payload.householdId,
    triggerType: 'voice_capture_created',
    triggerRef: payload.captureId,
    decisionSource: 'event_bridge',
    affectedUserIds: [payload.actorUserId],
    result: 'observed',
  });
}

export async function runSurfaceHealthWatchdog(
  activeGraphClient: HomeNodeGraphClient,
  activeEventBus: ManagedEventBus,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - SURFACE_INACTIVITY_THRESHOLD_MS).toISOString();
  const staleSurfaces = activeGraphClient.listStaleActiveSurfaces(cutoff);

  const transitionedByHousehold = new Map<string, string[]>();
  for (const surface of staleSurfaces) {
    if (!activeGraphClient.markSurfaceInactive(surface.surface_id)) {
      continue;
    }

    const current = transitionedByHousehold.get(surface.household_id) ?? [];
    current.push(surface.surface_id);
    transitionedByHousehold.set(surface.household_id, current);
  }

  if (transitionedByHousehold.size === 0) {
    return [];
  }

  const transitionedSurfaceIds: string[] = [];
  for (const [householdId, surfaceIds] of transitionedByHousehold.entries()) {
    transitionedSurfaceIds.push(...surfaceIds);
    const data = {
      status: 'degraded',
      reason: 'stale surface heartbeats',
      checked_at: now.toISOString(),
      affected_surface_ids: surfaceIds,
    };

    await activeEventBus.publish(
      Topics.lifeos.homeNodeHealthChanged,
      createEvent(Topics.lifeos.homeNodeHealthChanged, data, householdId),
    );
  }

  return transitionedSurfaceIds;
}

export async function startHomeNodeService(): Promise<void> {
  await startService({
    serviceName: 'home-node',
    port: Number(process.env.LIFEOS_HOME_NODE_PORT ?? 3010),
    secretRefs: [],
    secretStore: createEnvSecretStore(),
    healthChecks: [
      {
        name: 'home-node-db',
        check: async () => {
          if (!graphClient) {
            return { status: 'unhealthy' as const, reason: 'home-node graph not initialized' };
          }

          return graphClient.isHealthy()
            ? { status: 'healthy' as const }
            : { status: 'unhealthy' as const, reason: 'home-node graph unavailable' };
        },
      },
      {
        name: 'home-node-event-bus',
        check: async () => {
          if (!eventBus) {
            return { status: 'unhealthy' as const, reason: 'event bus not initialized' };
          }

          const health = eventBus.getConnectionHealth();
          if (health === 'connected') {
            return { status: 'healthy' as const };
          }

          if (health === 'degraded') {
            return {
              status: 'degraded' as const,
              reason: 'event bus connection is degraded',
            };
          }

          return { status: 'unhealthy' as const, reason: 'event bus is disconnected' };
        },
      },
    ],
    registerRoutes: async (app) => {
      graphClient = new HomeNodeGraphClient(
        process.env.LIFEOS_HOME_NODE_DB_PATH ?? './data/home-node.db',
      );
      graphClient.initializeSchema();

      eventBus = createEventBusClient({
        env: process.env,
      });

      await eventBus.subscribe(Topics.lifeos.householdHomeStateChanged, async (event) => {
        await handleHomeStateChangedEvent(graphClient as HomeNodeGraphClient, eventBus as ManagedEventBus, event as BaseEvent<unknown>);
      });

      await eventBus.subscribe(Topics.lifeos.householdVoiceCaptureCreated, async (event) => {
        handleVoiceCaptureEvent(graphClient as HomeNodeGraphClient, event as BaseEvent<unknown>);
      });

      registerHomeNodeRoutes(app, graphClient, {
        onSurfaceRegistered: async (surface) => {
          await publishSurfaceRegisteredEvent(eventBus as ManagedEventBus, surface);
        },
        onSurfaceDeregistered: async (surface) => {
          await publishSurfaceDeregisteredEvent(eventBus as ManagedEventBus, surface);
        },
        getDisplayFeedSignalVersion,
        waitForDisplayFeedSignal,
      });

      await eventBus.subscribe(Topics.lifeos.homeNodeDisplayFeedUpdated, async (event) => {
        const payload = HomeNodeDisplayFeedEventSchema.parse(event.data);
        signalDisplayFeedUpdated(payload.household_id);
      });

      let lastStatus: WatchdogStatus = 'healthy';
      watchdogInterval = setInterval(async () => {
        if (!eventBus || !graphClient) {
          return;
        }

        try {
          const health = eventBus.getConnectionHealth();
          const currentStatus: WatchdogStatus = health === 'connected' ? 'healthy' : 'degraded';
          if (currentStatus === 'degraded' && currentStatus !== lastStatus) {
            const data = {
              status: 'degraded',
              reason: `event bus connection ${health}`,
              checked_at: new Date().toISOString(),
            };

            await eventBus.publish(
              Topics.lifeos.homeNodeHealthChanged,
              createEvent(Topics.lifeos.homeNodeHealthChanged, data, 'system'),
            );
          }

          await runSurfaceHealthWatchdog(graphClient, eventBus);
          lastStatus = currentStatus;
        } catch (error) {
          console.error(
            JSON.stringify({
              message: 'home-node watchdog loop failed',
              error: error instanceof Error ? error.message : 'unknown_error',
            }),
          );
        }
      }, WATCHDOG_INTERVAL_MS);

      app.addHook('onClose', async () => {
        if (watchdogInterval) {
          clearInterval(watchdogInterval);
          watchdogInterval = null;
        }

        await eventBus?.close();
        for (const waiters of displayFeedSignalWaiters.values()) {
          for (const waiter of waiters) {
            clearTimeout(waiter.timeout);
          }
        }
        displayFeedSignalWaiters.clear();
        displayFeedSignalVersions.clear();
        graphClient?.close();
      });
    },
  });
}