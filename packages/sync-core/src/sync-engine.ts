import { randomUUID } from 'node:crypto';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';

const SYNC_VERSION = '0.1.0';
const MAX_TRACKED_DELTAS = 2000;

export interface SyncDelta {
  deltaId: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  payload: BaseEvent<Record<string, unknown>>;
  version: string;
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
  eventBus: ManagedEventBus;
  deviceId: string;
  deviceName: string;
  now?: () => Date;
  logger?: (message: string) => void;
  shouldBroadcast?: (event: BaseEvent<Record<string, unknown>>) => boolean;
  onIncomingDelta?: (delta: SyncDelta) => Promise<void> | void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
  private readonly eventBus: ManagedEventBus;
  private readonly now: () => Date;
  private readonly logger: (message: string) => void;
  private readonly shouldBroadcast: (event: BaseEvent<Record<string, unknown>>) => boolean;
  private readonly onIncomingDelta: (delta: SyncDelta) => Promise<void>;
  private readonly seenDeltaIds = new Set<string>();
  private readonly devices = new Map<string, SyncDeviceSnapshot>();
  private readonly stats: SyncEngineStats = {
    deltasBroadcast: 0,
    deltasReceived: 0,
    deltasReplayed: 0,
  };
  private started = false;
  private active = false;

  constructor(private readonly options: SyncEngineOptions) {
    this.eventBus = options.eventBus;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? (() => undefined);
    this.shouldBroadcast = options.shouldBroadcast ?? (() => true);
    this.onIncomingDelta = async (delta) => {
      await options.onIncomingDelta?.(delta);
    };
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

    await this.eventBus.subscribe<Record<string, unknown>>('lifeos.>', async (event) => {
      if (!this.active) {
        return;
      }
      const typed = event as BaseEvent<Record<string, unknown>>;
      if (typed.type === Topics.lifeos.syncDelta) {
        const delta = toSyncDelta(typed.data);
        if (!delta) {
          this.logger('[SyncEngine] Ignoring malformed sync delta.');
          return;
        }
        await this.handleIncomingDelta(delta);
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

  async handleIncomingDelta(delta: SyncDelta): Promise<boolean> {
    if (
      !this.active ||
      delta.deviceId === this.options.deviceId ||
      this.seenDeltaIds.has(delta.deltaId)
    ) {
      return false;
    }

    this.seenDeltaIds.add(delta.deltaId);
    trimSet(this.seenDeltaIds, MAX_TRACKED_DELTAS);
    this.devices.set(delta.deviceId, {
      deviceId: delta.deviceId,
      deviceName: delta.deviceName,
      lastSyncTimestamp: delta.timestamp,
    });
    this.stats.deltasReceived += 1;

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
    return true;
  }
}
