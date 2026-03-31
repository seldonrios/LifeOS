import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { tmpdir } from 'node:os';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/module-sdk';

import { createHouseholdChoresModule } from '../../household-chores/src/index';
import { createHouseholdShoppingModule } from '../../household-shopping/src/index';
import { householdCaptureRouterModule } from './index';

type EventHandler = (event: BaseEvent<unknown>) => Promise<void>;

class IntegrationEventBus implements ManagedEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
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
    callbacks.push(handler as EventHandler);
    this.handlers.set(topic, callbacks);
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }

  getTransport(): 'unknown' {
    return 'unknown';
  }
}

function createEventEnvelope<T extends Record<string, unknown>>(
  topic: string,
  data: T,
  source: string,
): BaseEvent<T> {
  return {
    id: randomUUID(),
    type: topic,
    timestamp: new Date().toISOString(),
    source,
    version: 'test',
    data,
  };
}

async function publishViaContext<T extends Record<string, unknown>>(
  bus: ManagedEventBus,
  topic: string,
  data: T,
  source: string,
): Promise<BaseEvent<T>> {
  const event = createEventEnvelope(topic, data, source);
  await bus.publish(topic, event);
  return event;
}

async function loadBetterSqlite(t: TestContext): Promise<
  | (new (dbPath: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown;
        get: (...args: unknown[]) => unknown;
      };
      close: () => void;
    })
  | null
> {
  try {
    const sqlite = (await import('better-sqlite3')) as { default?: unknown };
    if (typeof sqlite.default !== 'function') {
      t.skip('better-sqlite3 default export is unavailable');
      return null;
    }
    return sqlite.default as new (dbPath: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown;
        get: (...args: unknown[]) => unknown;
      };
      close: () => void;
    };
  } catch {
    t.skip('better-sqlite3 not available in this environment');
    return null;
  }
}

test('integration: capture routes to shopping DB, ambiguous unresolved, duplicate replay ignored', async (t) => {
  const Database = await loadBetterSqlite(t);
  if (!Database) {
    return;
  }

  const workspace = mkdtempSync(join(tmpdir(), 'lifeos-household-capture-router-int-'));
  const dbPath = join(workspace, 'household.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      name TEXT
    );
    CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY,
      list_id TEXT,
      household_id TEXT NOT NULL,
      title TEXT NOT NULL,
      added_by TEXT,
      added_by_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'added',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chores (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      title TEXT NOT NULL,
      assigned_to_user_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      recurrence_rule TEXT,
      completed_by_user_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const bus = new IntegrationEventBus();
  const env = {
    LIFEOS_HOUSEHOLD_DB_PATH: dbPath,
    LIFEOS_AI_ENABLED: 'false',
  } as NodeJS.ProcessEnv;

  const observedTopics: string[] = [];
  await bus.subscribe(Topics.lifeos.householdShoppingItemAddRequested, async () => {
    observedTopics.push(Topics.lifeos.householdShoppingItemAddRequested);
  });
  await bus.subscribe(Topics.lifeos.householdCaptureUnresolved, async () => {
    observedTopics.push(Topics.lifeos.householdCaptureUnresolved);
  });

  const shoppingModule = createHouseholdShoppingModule();
  const choresModule = createHouseholdChoresModule();

  const createContext = (moduleId: string) => ({
    env,
    graphPath: undefined,
    eventBus: bus,
    createLifeGraphClient: (() => {
      throw new Error('not used in integration test');
    }) as never,
    subscribe: async <T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void> | void) => {
      await bus.subscribe(topic, async (event) => {
        await handler(event as BaseEvent<T>);
      });
    },
    publish: async <T extends Record<string, unknown>>(topic: string, data: T, source?: string) => {
      return publishViaContext(bus, topic, data, source ?? moduleId);
    },
    log: () => {
      return;
    },
  });

  await householdCaptureRouterModule.init(createContext('household-capture-router'));
  await shoppingModule.init(createContext('household-shopping'));
  await choresModule.init(createContext('household-chores'));

  const shoppingCapture = {
    captureId: 'cap_1',
    householdId: 'house_1',
    actorUserId: 'user_1',
    text: 'add oat milk to the shopping list',
    audioRef: null,
    source: 'mobile' as const,
    createdAt: '2026-03-30T22:00:00.000Z',
  };

  await publishViaContext(
    bus,
    Topics.lifeos.householdVoiceCaptureCreated,
    shoppingCapture,
    'integration-test',
  );

  const shoppingRows = db
    .prepare('SELECT title FROM shopping_items WHERE household_id = ? ORDER BY created_at ASC')
    .all('house_1') as Array<{ title: string }>;
  assert.equal(shoppingRows.length, 1);
  assert.equal(shoppingRows[0]?.title, 'oat milk');
  assert.ok(observedTopics.includes(Topics.lifeos.householdShoppingItemAddRequested));

  await publishViaContext(
    bus,
    Topics.lifeos.householdVoiceCaptureCreated,
    {
      captureId: 'cap_2',
      householdId: 'house_1',
      actorUserId: 'user_1',
      text: 'thing for Saturday',
      audioRef: null,
      source: 'mobile',
      createdAt: '2026-03-30T22:05:00.000Z',
    },
    'integration-test',
  );

  assert.ok(observedTopics.includes(Topics.lifeos.householdCaptureUnresolved));

  await publishViaContext(
    bus,
    Topics.lifeos.householdVoiceCaptureCreated,
    shoppingCapture,
    'integration-test',
  );

  const shoppingCount = db
    .prepare('SELECT COUNT(*) AS count FROM shopping_items WHERE household_id = ?')
    .get('house_1') as { count: number };
  assert.equal(shoppingCount.count, 1);

  await bus.close();
  db.close();
  rmSync(workspace, { recursive: true, force: true });
});
