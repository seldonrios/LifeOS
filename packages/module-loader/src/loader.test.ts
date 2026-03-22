import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, ManagedEventBus } from '@lifeos/event-bus';

import { ModuleLoader, type LifeOSModule } from './loader';

class MockEventBus implements ManagedEventBus {
  public readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];
  private readonly handlers = new Map<
    string,
    Array<(event: BaseEvent<unknown>) => Promise<void>>
  >();
  public closed = false;

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });
    const callbacks = this.handlers.get(topic) ?? [];
    for (const callback of callbacks) {
      await callback(event as BaseEvent<unknown>);
    }
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    const callbacks = this.handlers.get(topic) ?? [];
    callbacks.push(handler as (event: BaseEvent<unknown>) => Promise<void>);
    this.handlers.set(topic, callbacks);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  getTransport() {
    return 'unknown' as const;
  }
}

test('ModuleLoader loads modules and reports loaded ids', async () => {
  const eventBus = new MockEventBus();
  const loaded: string[] = [];
  const loader = new ModuleLoader({
    eventBus,
    logger: () => {
      return;
    },
  });

  const module: LifeOSModule = {
    id: 'reminder',
    async init() {
      loaded.push('reminder');
    },
  };

  await loader.load(module);

  assert.deepEqual(loaded, ['reminder']);
  assert.equal(loader.has('reminder'), true);
  assert.deepEqual(loader.getModuleIds(), ['reminder']);
});

test('ModuleLoader context subscribe + publish routes events through bus', async () => {
  const eventBus = new MockEventBus();
  const seen: string[] = [];
  const loader = new ModuleLoader({
    eventBus,
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'observer',
    async init(context) {
      await context.subscribe<{ value: string }>('lifeos.test', async (event) => {
        seen.push(event.data.value);
      });
    },
  });

  const published = await loader.publish('lifeos.test', { value: 'ok' });

  assert.equal(published.type, 'lifeos.test');
  assert.deepEqual(seen, ['ok']);
  assert.equal(eventBus.published.length, 1);
});

test('ModuleLoader close calls module dispose and closes event bus', async () => {
  const eventBus = new MockEventBus();
  const disposed: string[] = [];
  const loader = new ModuleLoader({
    eventBus,
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'one',
    async init() {
      return;
    },
    async dispose() {
      disposed.push('one');
    },
  });

  await loader.close();

  assert.deepEqual(disposed, ['one']);
  assert.equal(eventBus.closed, true);
  assert.deepEqual(loader.getAll(), []);
});
