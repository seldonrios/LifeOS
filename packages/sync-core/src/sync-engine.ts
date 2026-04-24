import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

import { Topics, type BaseEvent, type EventBus } from '@lifeos/event-bus';
import { createLifeGraphClient, type LifeGraphClient } from '@lifeos/life-graph';
import {
  SyncTrustRegistry,
  type SyncLocalKeyPair,
  type SyncTrustRegistryLike,
} from './trust-registry';

const SYNC_VERSION = '0.1.0';
const MAX_TRACKED_DELTAS = 2000;

export interface SyncDelta {
  deltaId: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  payload: BaseEvent<Record<string, unknown>>;
  version: string;
  signature?: string;
  signingPublicKey?: string;
  signingAlgorithm?: 'ed25519';
}

export interface SyncDeviceSnapshot {
  deviceId: string;
  deviceName: string;
  lastSyncTimestamp: string;
}

export interface SyncEngineStats {
  deltasBroadcast: number;
  deltasReceived: number;
  deltasReplayed: number;
}

export interface SyncEngineOptions {
  eventBus: EventBus;
  deviceId: string;
  deviceName: string;
  env?: NodeJS.ProcessEnv;
  graphPath?: string;
  now?: () => Date;
  logger?: (message: string) => void;
  client?: Pick<LifeGraphClient, 'mergeDelta'>;
  shouldBroadcast?: (event: BaseEvent<Record<string, unknown>>) => boolean;
  onIncomingDelta?: (delta: SyncDelta) => Promise<void> | void;
  trustRegistry?: SyncTrustRegistryLike;
  requireAuthentication?: boolean;
  trustOnFirstUse?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCanonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, stableCanonicalize(record[key])]),
    );
  }
  return value;
}

function serializeDeltaForSigning(delta: SyncDelta): string {
  return JSON.stringify(
    stableCanonicalize({
      deltaId: delta.deltaId,
      deviceId: delta.deviceId,
      deviceName: delta.deviceName,
      timestamp: delta.timestamp,
      payload: delta.payload,
      version: delta.version,
    }),
  );
}

function verifyDeltaSignature(delta: SyncDelta): boolean {
  if (!delta.signature || !delta.signingPublicKey || delta.signingAlgorithm !== 'ed25519') {
    return false;
  }
  try {
    const publicKey = createPublicKey(delta.signingPublicKey);
    const payload = Buffer.from(serializeDeltaForSigning(delta), 'utf8');
    const signature = Buffer.from(delta.signature, 'base64');
    return verify(null, payload, publicKey, signature);
  } catch {
    return false;
  }
}

function toSyncDelta(value: unknown): SyncDelta | null {
  if (!isRecord(value)) {
    return null;
  }
  const payload = value.payload;
  if (!isRecord(payload)) {
    return null;
  }
  if (
    typeof value.deltaId !== 'string' ||
    typeof value.deviceId !== 'string' ||
    typeof value.deviceName !== 'string' ||
    typeof value.timestamp !== 'string' ||
    typeof value.version !== 'string'
  ) {
    return null;
  }
  if (
    typeof payload.id !== 'string' ||
    typeof payload.type !== 'string' ||
    typeof payload.timestamp !== 'string' ||
    typeof payload.source !== 'string' ||
    typeof payload.version !== 'string' ||
    !isRecord(payload.data)
  ) {
    return null;
  }

  const basePayload: BaseEvent<Record<string, unknown>> = {
    id: payload.id,
    type: payload.type,
    timestamp: payload.timestamp,
    source: payload.source,
    version: payload.version,
    data: payload.data,
    ...(isRecord(payload.metadata) ? { metadata: payload.metadata } : {}),
  };

  return {
    deltaId: value.deltaId,
    deviceId: value.deviceId,
    deviceName: value.deviceName,
    timestamp: value.timestamp,
    payload: basePayload,
    version: value.version,
    ...(typeof value.signature === 'string' && value.signature.trim().length > 0
      ? { signature: value.signature.trim() }
      : {}),
    ...(typeof value.signingPublicKey === 'string' && value.signingPublicKey.trim().length > 0
      ? { signingPublicKey: value.signingPublicKey.trim() }
      : {}),
    ...(value.signingAlgorithm === 'ed25519' ? { signingAlgorithm: 'ed25519' as const } : {}),
  };
}

function isSyncReplayed(event: BaseEvent<Record<string, unknown>>): boolean {
  return event.metadata?.syncReplayed === true;
}

function isSyncTopic(event: BaseEvent<Record<string, unknown>>): boolean {
  return event.type === Topics.lifeos.syncDelta;
}

function trimSet(set: Set<string>, maxSize: number): void {
  while (set.size > maxSize) {
    const oldest = set.values().next().value;
    if (!oldest) {
      return;
    }
    set.delete(oldest);
  }
}

export class SyncEngine {
  private readonly eventBus: EventBus;
  private readonly client: Pick<LifeGraphClient, 'mergeDelta'>;
  private readonly now: () => Date;
  private readonly logger: (message: string) => void;
  private readonly shouldBroadcast: (event: BaseEvent<Record<string, unknown>>) => boolean;
  private readonly onIncomingDelta: (delta: SyncDelta) => Promise<void>;
  private readonly trustRegistry: SyncTrustRegistryLike;
  private readonly requireAuthentication: boolean;
  private readonly trustOnFirstUse: boolean;
  private readonly seenDeltaIds = new Set<string>();
  private readonly devices = new Map<string, SyncDeviceSnapshot>();
  private readonly stats: SyncEngineStats = {
    deltasBroadcast: 0,
    deltasReceived: 0,
    deltasReplayed: 0,
  };
  private started = false;
  private active = false;
  private localKeyPair: SyncLocalKeyPair | null = null;

  constructor(private readonly options: SyncEngineOptions) {
    this.eventBus = options.eventBus;
    this.client =
      options.client ??
      createLifeGraphClient({
        ...(options.env ? { env: options.env } : {}),
        ...(options.graphPath ? { graphPath: options.graphPath } : {}),
      });
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? (() => undefined);
    this.shouldBroadcast = options.shouldBroadcast ?? (() => true);
    this.onIncomingDelta = async (delta) => {
      await options.onIncomingDelta?.(delta);
    };
    this.trustRegistry =
      options.trustRegistry ??
      new SyncTrustRegistry({
        ...(options.env ? { env: options.env } : {}),
      });
    this.requireAuthentication =
      options.requireAuthentication ??
      (options.env?.LIFEOS_SYNC_REQUIRE_AUTH ?? '1').trim().toLowerCase() !== '0';
    this.trustOnFirstUse =
      options.trustOnFirstUse ??
      (options.env?.LIFEOS_SYNC_TOFU ?? '1').trim().toLowerCase() !== '0';
    this.devices.set(options.deviceId, {
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      lastSyncTimestamp: this.now().toISOString(),
    });
  }

  getDeviceId(): string {
    return this.options.deviceId;
  }

  getDeviceName(): string {
    return this.options.deviceName;
  }

  getKnownDevices(): SyncDeviceSnapshot[] {
    return Array.from(this.devices.values()).sort((left, right) =>
      left.deviceName.localeCompare(right.deviceName),
    );
  }

  getStats(): SyncEngineStats {
    return {
      deltasBroadcast: this.stats.deltasBroadcast,
      deltasReceived: this.stats.deltasReceived,
      deltasReplayed: this.stats.deltasReplayed,
    };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    this.active = true;
    if (this.requireAuthentication) {
      this.localKeyPair = await this.trustRegistry.getLocalKeyPair();
      this.logger('[SyncEngine] Sync authentication: enabled (Ed25519 + TOFU)');
    } else {
      this.logger(
        '[SyncEngine] WARNING: Sync authentication disabled via LIFEOS_SYNC_REQUIRE_AUTH=0 override',
      );
    }

    await this.eventBus.subscribe<Record<string, unknown>>('lifeos.>', async (event) => {
      if (!this.active) {
        return;
      }
      const typed = event as BaseEvent<Record<string, unknown>>;
      if (typed.type === Topics.lifeos.syncDelta) {
        const delta = toSyncDelta(typed.data);
        if (!delta) {
          this.logger('[SyncEngine] ignoring malformed sync delta');
          return;
        }
        try {
          await this.handleIncomingDelta(delta);
        } catch (error: unknown) {
          this.logger(`[SyncEngine] incoming delta handler degraded: ${String(error)}`);
        }
        return;
      }

      await this.broadcastDelta(typed);
    });
  }

  async close(): Promise<void> {
    this.active = false;
  }

  async broadcastDelta(event: BaseEvent<Record<string, unknown>>): Promise<void> {
    if (
      !this.active ||
      isSyncTopic(event) ||
      isSyncReplayed(event) ||
      !this.shouldBroadcast(event)
    ) {
      return;
    }

    const timestamp = this.now().toISOString();
    const delta: SyncDelta = {
      deltaId: randomUUID(),
      deviceId: this.options.deviceId,
      deviceName: this.options.deviceName,
      timestamp,
      payload: event,
      version: SYNC_VERSION,
    };
    if (this.requireAuthentication) {
      const localKeyPair = this.localKeyPair ?? (await this.trustRegistry.getLocalKeyPair());
      this.localKeyPair = localKeyPair;
      const signature = sign(
        null,
        Buffer.from(serializeDeltaForSigning(delta), 'utf8'),
        createPrivateKey(localKeyPair.privateKey),
      );
      delta.signingAlgorithm = 'ed25519';
      delta.signingPublicKey = localKeyPair.publicKey;
      delta.signature = signature.toString('base64');
    }

    this.seenDeltaIds.add(delta.deltaId);
    trimSet(this.seenDeltaIds, MAX_TRACKED_DELTAS);
    this.devices.set(this.options.deviceId, {
      deviceId: this.options.deviceId,
      deviceName: this.options.deviceName,
      lastSyncTimestamp: timestamp,
    });
    this.stats.deltasBroadcast += 1;

    await this.eventBus.publish(Topics.lifeos.syncDelta, {
      id: randomUUID(),
      type: Topics.lifeos.syncDelta,
      timestamp,
      source: 'sync-core',
      version: SYNC_VERSION,
      data: delta,
      metadata: {
        syncOriginDeviceId: this.options.deviceId,
      },
    });
  }

  private async publishAudit(delta: SyncDelta, accepted: boolean, reason: string): Promise<void> {
    try {
      await this.eventBus.publish(Topics.lifeos.syncAuditLogged, {
        id: randomUUID(),
        type: Topics.lifeos.syncAuditLogged,
        timestamp: this.now().toISOString(),
        source: 'sync-core',
        version: SYNC_VERSION,
        data: {
          deltaId: delta.deltaId,
          deviceId: delta.deviceId,
          deviceName: delta.deviceName,
          accepted,
          reason,
        },
        metadata: {
          syncReplayed: true,
          syncOriginDeviceId: delta.deviceId,
        },
      });
    } catch (error: unknown) {
      this.logger(`[SyncEngine] audit publish degraded: ${String(error)}`);
    }
  }

  async handleIncomingDelta(delta: SyncDelta): Promise<boolean> {
    if (!this.active || delta.deviceId === this.options.deviceId) {
      return false;
    }
    if (this.seenDeltaIds.has(delta.deltaId)) {
      return false;
    }

    if (this.requireAuthentication) {
      if (delta.signingAlgorithm !== 'ed25519') {
        this.logger(`[SyncEngine] rejected delta ${delta.deltaId}: unsupported signing algorithm`);
        await this.publishAudit(delta, false, 'invalid_signing_algorithm');
        return false;
      }
      if (!delta.signature || !delta.signingPublicKey) {
        this.logger(`[SyncEngine] rejected delta ${delta.deltaId}: missing signature`);
        await this.publishAudit(delta, false, 'missing_signature');
        return false;
      }
      if (!verifyDeltaSignature(delta)) {
        this.logger(`[SyncEngine] rejected delta ${delta.deltaId}: invalid signature`);
        await this.publishAudit(delta, false, 'invalid_signature');
        return false;
      }

      const knownPeer = await this.trustRegistry.getTrustedPeer(delta.deviceId);
      if (knownPeer) {
        if (knownPeer.publicKey !== delta.signingPublicKey) {
          this.logger(
            `[SyncEngine] rejected delta ${delta.deltaId}: peer key mismatch for ${delta.deviceId}`,
          );
          await this.publishAudit(delta, false, 'peer_key_mismatch');
          return false;
        }
        await this.trustRegistry.upsertTrustedPeer(
          delta.deviceId,
          delta.signingPublicKey,
          delta.deviceName,
        );
      } else if (this.trustOnFirstUse) {
        await this.trustRegistry.upsertTrustedPeer(
          delta.deviceId,
          delta.signingPublicKey,
          delta.deviceName,
        );
        this.logger(`[SyncEngine] trusted peer ${delta.deviceId} (TOFU)`);
      } else {
        this.logger(`[SyncEngine] rejected delta ${delta.deltaId}: untrusted peer`);
        await this.publishAudit(delta, false, 'untrusted_peer');
        return false;
      }
    }

    this.logger(`[SyncEngine] syncing delta from ${delta.deviceId}`);

    try {
      const mergeResult = await this.client.mergeDelta(delta.payload);
      const mergeConflicts =
        mergeResult && Array.isArray(mergeResult.conflicts) ? mergeResult.conflicts : [];
      this.seenDeltaIds.add(delta.deltaId);
      trimSet(this.seenDeltaIds, MAX_TRACKED_DELTAS);
      this.devices.set(delta.deviceId, {
        deviceId: delta.deviceId,
        deviceName: delta.deviceName,
        lastSyncTimestamp: delta.timestamp,
      });
      this.stats.deltasReceived += 1;
      this.logger('[SyncEngine] delta merged successfully');

      if (mergeConflicts.length > 0) {
        this.logger(
          `[SyncEngine] merge conflicts detected (${mergeConflicts.length}) for delta ${delta.deltaId}`,
        );
        await this.eventBus.publish(Topics.lifeos.syncConflictDetected, {
          id: randomUUID(),
          type: Topics.lifeos.syncConflictDetected,
          timestamp: this.now().toISOString(),
          source: 'sync-core',
          version: SYNC_VERSION,
          data: {
            deltaId: delta.deltaId,
            deviceId: delta.deviceId,
            deviceName: delta.deviceName,
            conflictCount: mergeConflicts.length,
            conflicts: mergeConflicts,
          },
          metadata: {
            syncReplayed: true,
            syncOriginDeviceId: delta.deviceId,
          },
        });
      }

      await this.onIncomingDelta(delta);

      const replayedEvent: BaseEvent<Record<string, unknown>> = {
        ...delta.payload,
        metadata: {
          ...(isRecord(delta.payload.metadata) ? delta.payload.metadata : {}),
          syncReplayed: true,
          syncOriginDeviceId: delta.deviceId,
          syncDeltaId: delta.deltaId,
        },
      };
      await this.eventBus.publish(replayedEvent.type, replayedEvent);
      this.stats.deltasReplayed += 1;
      await this.publishAudit(delta, true, 'accepted');
      return true;
    } catch (error: unknown) {
      this.logger(`[SyncEngine] failed to merge delta: ${String(error)}`);
      await this.publishAudit(delta, false, 'merge_failed');
      return false;
    }
  }
}
