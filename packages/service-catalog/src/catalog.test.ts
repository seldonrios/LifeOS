import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, EventBus } from '@lifeos/event-bus';

import { ServiceCatalog } from './catalog';
import { attachCatalogEventSubscribers, CatalogTopics } from './events';
import type { CatalogEntry } from './types';

class MockEventBus implements EventBus {
  private readonly handlers = new Map<
    string,
    Array<(event: BaseEvent<unknown>) => Promise<void>>
  >();

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    const listeners = this.handlers.get(topic) ?? [];
    for (const listener of listeners) {
      await listener(event as BaseEvent<unknown>);
    }
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    const listeners = this.handlers.get(topic) ?? [];
    listeners.push(handler as (event: BaseEvent<unknown>) => Promise<void>);
    this.handlers.set(topic, listeners);
  }

  async emit<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    await this.publish(topic, event);
  }
}

function buildEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'svc-a',
    name: 'svc-a',
    capabilities: ['alpha', 'beta'],
    healthUrl: 'http://svc-a/health',
    status: 'healthy',
    ...overrides,
  };
}

test('register removes stale capability bindings on re-registration', () => {
  const catalog = new ServiceCatalog();

  catalog.register(buildEntry({ capabilities: ['alpha', 'beta'] }));
  catalog.register(buildEntry({ capabilities: ['alpha'] }));

  assert.equal(catalog.resolve('alpha')?.id, 'svc-a');
  assert.equal(catalog.resolve('beta'), undefined);
  assert.equal(catalog.resolveAll('beta').length, 0);
});

test('catalog event subscribers ignore duplicate and out-of-order events', async () => {
  const catalog = new ServiceCatalog();
  const eventBus = new MockEventBus();
  await attachCatalogEventSubscribers(catalog, eventBus);

  await eventBus.emit(CatalogTopics.registered, {
    id: 'evt-register-1',
    type: CatalogTopics.registered,
    timestamp: '2026-03-11T10:00:00.000Z',
    source: 'test',
    version: '1.0.0',
    data: { entry: buildEntry() },
  });

  await eventBus.emit(CatalogTopics.statusChanged, {
    id: 'evt-status-1',
    type: CatalogTopics.statusChanged,
    timestamp: '2026-03-11T10:00:01.000Z',
    source: 'test',
    version: '1.0.0',
    data: { id: 'svc-a', status: 'degraded' as const },
  });

  await eventBus.emit(CatalogTopics.statusChanged, {
    id: 'evt-status-2',
    type: CatalogTopics.statusChanged,
    timestamp: '2026-03-11T09:59:59.000Z',
    source: 'test',
    version: '1.0.0',
    data: { id: 'svc-a', status: 'healthy' as const },
  });

  await eventBus.emit(CatalogTopics.statusChanged, {
    id: 'evt-status-1',
    type: CatalogTopics.statusChanged,
    timestamp: '2026-03-11T10:00:03.000Z',
    source: 'test',
    version: '1.0.0',
    data: { id: 'svc-a', status: 'healthy' as const },
  });

  const entry = catalog.getAll().find((candidate) => candidate.id === 'svc-a');
  assert.ok(entry);
  assert.equal(entry.status, 'degraded');
});
