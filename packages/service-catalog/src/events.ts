import { randomUUID } from 'node:crypto';

import type { BaseEvent, EventBus } from '@lifeos/event-bus';

import type { ServiceCatalog } from './catalog';
import type { CatalogEntry } from './types';

export const CatalogTopics = {
  registered: 'service.catalog.registered',
  deregistered: 'service.catalog.deregistered',
  statusChanged: 'service.catalog.status.changed',
} as const;

export interface CatalogRegisteredEventData {
  entry: CatalogEntry;
}

export interface CatalogDeregisteredEventData {
  id: string;
}

export interface CatalogStatusChangedEventData {
  id: string;
  status: CatalogEntry['status'];
}

type CatalogEventData =
  | CatalogRegisteredEventData
  | CatalogDeregisteredEventData
  | CatalogStatusChangedEventData;

interface CatalogEventOptions {
  source?: string;
}

function createCatalogEvent<T extends CatalogEventData>(
  type: string,
  data: T,
  options: CatalogEventOptions = {},
): BaseEvent<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source: options.source ?? 'service-catalog',
    version: '1.0.0',
    data,
  };
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createCatalogEventPublisher(eventBus: EventBus, options: CatalogEventOptions = {}) {
  return {
    async publishRegistered(entry: CatalogEntry): Promise<void> {
      await eventBus.publish(
        CatalogTopics.registered,
        createCatalogEvent('service.catalog.registered', { entry }, options),
      );
    },

    async publishDeregistered(id: string): Promise<void> {
      await eventBus.publish(
        CatalogTopics.deregistered,
        createCatalogEvent('service.catalog.deregistered', { id }, options),
      );
    },

    async publishStatusChanged(id: string, status: CatalogEntry['status']): Promise<void> {
      await eventBus.publish(
        CatalogTopics.statusChanged,
        createCatalogEvent('service.catalog.status.changed', { id, status }, options),
      );
    },
  };
}

export function attachCatalogEventSubscribers(
  catalog: ServiceCatalog,
  eventBus: EventBus,
): Promise<void> {
  const seenEventIds = new Set<string>();
  const lastAppliedAt = new Map<string, number>();

  const shouldApply = (entryId: string, eventId: string, timestamp: string): boolean => {
    if (seenEventIds.has(eventId)) {
      return false;
    }
    seenEventIds.add(eventId);

    const eventTs = toTimestamp(timestamp);
    const knownTs = lastAppliedAt.get(entryId) ?? Number.NEGATIVE_INFINITY;
    if (eventTs < knownTs) {
      return false;
    }

    lastAppliedAt.set(entryId, eventTs);
    return true;
  };

  return Promise.all([
    eventBus.subscribe<CatalogRegisteredEventData>(CatalogTopics.registered, async (event) => {
      const entry = event.data.entry;
      if (!shouldApply(entry.id, event.id, event.timestamp)) {
        return;
      }
      catalog.register(entry);
    }),
    eventBus.subscribe<CatalogDeregisteredEventData>(CatalogTopics.deregistered, async (event) => {
      const { id } = event.data;
      if (!shouldApply(id, event.id, event.timestamp)) {
        return;
      }
      catalog.deregister(id);
    }),
    eventBus.subscribe<CatalogStatusChangedEventData>(
      CatalogTopics.statusChanged,
      async (event) => {
        const { id, status } = event.data;
        if (!shouldApply(id, event.id, event.timestamp)) {
          return;
        }
        catalog.updateStatus(id, status);
      },
    ),
  ]).then(() => undefined);
}
