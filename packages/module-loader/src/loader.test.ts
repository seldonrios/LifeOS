import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { BaseEvent, ManagedEventBus } from '@lifeos/event-bus';

import householdIdentityModule, {
  getHouseholdGraphClient,
} from '../../../modules/household-identity/src/index';
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
    requireManifest: false,
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
    requireManifest: false,
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
    requireManifest: false,
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

test('ModuleLoader validates module permissions from lifeos.json when present', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'secure-module');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'secure-module',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: ['weather'],
          voice: ['speak'],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/voice-core'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loaded: string[] = [];
  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'secure-module',
    async init() {
      loaded.push('secure-module');
    },
  });

  assert.deepEqual(loaded, ['secure-module']);
});

test('ModuleLoader rejects unauthorized permissions in lifeos.json', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'danger-module');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'danger-module',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['drop_database'],
          network: [],
          voice: [],
          events: ['publish:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/voice-core'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'danger-module',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader rejects invalid module id before loading', async () => {
  const eventBus = new MockEventBus();
  const loader = new ModuleLoader({
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: '../escape',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader validates and loads household-identity with db path env set', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-household-db-'));
  const dbPath = join(tempDir, 'household.db');
  const baseDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const loader = new ModuleLoader({
    baseDir,
    env: {
      ...process.env,
      LIFEOS_HOUSEHOLD_DB_PATH: dbPath,
    },
    eventBus,
    logger: () => {
      return;
    },
  });

  try {
    await loader.load(householdIdentityModule);
    assert.equal(loader.has('household-identity'), true);
  } finally {
    getHouseholdGraphClient().close();
    await loader.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ModuleLoader rejects manifest name mismatch', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'calendar-helper');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'different-name',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/voice-core'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'calendar-helper',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader rejects overly broad publish event permission', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'broad-publisher');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'broad-publisher',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['publish:lifeos.>'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/voice-core'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'broad-publisher',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader rejects overly broad subscribe event permission for non-system modules', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'broad-subscriber');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'broad-subscriber',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.>'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'broad-subscriber',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader allows broad subscribe permissions for trusted system modules', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'orchestrator');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'orchestrator',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read', 'write'],
          network: [],
          voice: ['speak'],
          events: ['subscribe:lifeos.>', 'publish:lifeos.orchestrator.suggestion'],
        },
        resources: {
          cpu: 'high',
          memory: 'medium',
        },
        requires: ['@lifeos/event-bus'],
        category: 'system',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'orchestrator',
    async init() {
      return;
    },
  });

  assert.equal(loader.has('orchestrator'), true);
});

test('ModuleLoader rejects module without manifest in strict mode', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const loader = new ModuleLoader({
    baseDir: tempDir,
    eventBus,
    requireManifest: true,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'strict-module',
      async init() {
        return;
      },
    });
  });
});

test('ModuleLoader enforces event publish permissions in strict runtime mode', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'event-locked');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'event-locked',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RUNTIME_PERMISSIONS: 'strict' },
    eventBus,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'event-locked',
      async init(context) {
        await context.publish('lifeos.unauthorized.publish', { ok: true }, 'event-locked');
      },
    });
  });
});

test('ModuleLoader enforces graph write permissions in strict runtime mode', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'graph-readonly');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'graph-readonly',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/life-graph'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RUNTIME_PERMISSIONS: 'strict' },
    eventBus,
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return { plans: [] };
        },
        async saveGraph() {
          return;
        },
      }) as never,
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'graph-readonly',
      async init(context) {
        const client = context.createLifeGraphClient();
        await client.saveGraph({} as never);
      },
    });
  });
});

test('ModuleLoader warn runtime mode logs unauthorized actions without blocking', async () => {
  const eventBus = new MockEventBus();
  const logs: string[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-'));
  const manifestDir = join(tempDir, 'modules', 'warn-mode-module');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'warn-mode-module',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'low',
          memory: 'low',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RUNTIME_PERMISSIONS: 'warn' },
    eventBus,
    logger: (line) => {
      logs.push(line);
    },
  });

  await loader.load({
    id: 'warn-mode-module',
    async init(context) {
      await context.publish('lifeos.unauthorized.publish', { ok: true }, 'warn-mode-module');
    },
  });

  assert.equal(loader.has('warn-mode-module'), true);
  assert.ok(logs.some((line) => line.includes('unauthorized event.publish')));
});

test('ModuleLoader strict resource enforcement blocks module init under high heap pressure', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-resource-strict-'));
  const manifestDir = join(tempDir, 'modules', 'resource-strict');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'resource-strict',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'high',
          memory: 'medium',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RESOURCE_ENFORCEMENT: 'strict' },
    eventBus,
    heapUsageProvider: () => ({
      heapUsed: 950,
      heapLimit: 1000,
    }),
    logger: () => {
      return;
    },
  });

  await assert.rejects(async () => {
    await loader.load({
      id: 'resource-strict',
      async init() {
        return;
      },
    });
  });

  const resourceEvent = eventBus.published.find((entry) => {
    const data = entry.event.data as { action?: string };
    return (
      entry.topic === 'lifeos.security.policy.denied' &&
      data.action === 'resource.enforcement.denied'
    );
  });
  assert.ok(resourceEvent);
});

test('ModuleLoader warn resource enforcement emits warning but loads module', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-resource-warn-'));
  const manifestDir = join(tempDir, 'modules', 'resource-warn');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'resource-warn',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'high',
          memory: 'medium',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RESOURCE_ENFORCEMENT: 'warn' },
    eventBus,
    heapUsageProvider: () => ({
      heapUsed: 950,
      heapLimit: 1000,
    }),
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'resource-warn',
    async init() {
      return;
    },
  });

  assert.equal(loader.has('resource-warn'), true);
  const resourceEvent = eventBus.published.find((entry) => {
    const data = entry.event.data as { action?: string };
    return (
      entry.topic === 'lifeos.security.policy.denied' && data.action === 'resource.enforcement.warn'
    );
  });
  assert.ok(resourceEvent);
});

test('ModuleLoader resource enforcement off bypasses pressure checks', async () => {
  const eventBus = new MockEventBus();
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-loader-resource-off-'));
  const manifestDir = join(tempDir, 'modules', 'resource-off');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    join(manifestDir, 'lifeos.json'),
    JSON.stringify(
      {
        name: 'resource-off',
        version: '0.1.0',
        author: 'tester',
        permissions: {
          graph: ['read'],
          network: [],
          voice: [],
          events: ['subscribe:lifeos.tick'],
        },
        resources: {
          cpu: 'high',
          memory: 'medium',
        },
        requires: ['@lifeos/event-bus'],
        category: 'custom',
        tags: ['test'],
      },
      null,
      2,
    ),
  );

  const loader = new ModuleLoader({
    baseDir: tempDir,
    env: { LIFEOS_MODULE_RESOURCE_ENFORCEMENT: 'off' },
    eventBus,
    heapUsageProvider: () => ({
      heapUsed: 950,
      heapLimit: 1000,
    }),
    logger: () => {
      return;
    },
  });

  await loader.load({
    id: 'resource-off',
    async init() {
      return;
    },
  });

  assert.equal(loader.has('resource-off'), true);
  const resourceEvents = eventBus.published.filter((entry) => {
    const data = entry.event.data as { action?: string };
    return (
      entry.topic === 'lifeos.security.policy.denied' &&
      typeof data.action === 'string' &&
      data.action.startsWith('resource.enforcement')
    );
  });
  assert.equal(resourceEvents.length, 0);
});
