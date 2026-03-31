import { randomUUID } from 'node:crypto';

import {
  HomeNodeStateSnapshotUpdatedSchema,
  HouseholdHomeStateChangedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  type HomeStateSnapshot,
  type HomeNodeStateSnapshotUpdated,
} from '@lifeos/contracts';
import { createEventBusClient, Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import { HomeNodeGraphClient, buildNextSnapshot } from '@lifeos/home-node-core';
import { createEnvSecretStore, startService } from '@lifeos/service-runtime';

import { registerHomeNodeRoutes } from './routes';

const DEFAULT_HOME_ID = 'home-default';
const WATCHDOG_INTERVAL_MS = 60_000;

type WatchdogStatus = 'healthy' | 'degraded';

let graphClient: HomeNodeGraphClient | null = null;
let eventBus: ManagedEventBus | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;

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

      registerHomeNodeRoutes(app, graphClient);

      let lastStatus: WatchdogStatus = 'healthy';
      watchdogInterval = setInterval(async () => {
        if (!eventBus) {
          return;
        }

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

        lastStatus = currentStatus;
      }, WATCHDOG_INTERVAL_MS);

      app.addHook('onClose', async () => {
        if (watchdogInterval) {
          clearInterval(watchdogInterval);
          watchdogInterval = null;
        }

        await eventBus?.close();
        graphClient?.close();
      });
    },
  });
}