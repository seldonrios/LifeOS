import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceCatalog } from './catalog';
import { startHealthPolling } from './poller';
import type { CatalogEntry } from './types';

function buildEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'svc-a',
    name: 'svc-a',
    capabilities: ['alpha'],
    healthUrl: 'http://svc-a/health',
    status: 'unknown',
    ...overrides,
  };
}

test('startHealthPolling marks service unhealthy when health checks time out', async () => {
  const originalFetch = globalThis.fetch;
  const catalog = new ServiceCatalog();
  catalog.register(buildEntry());

  globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }

      signal?.addEventListener(
        'abort',
        () => {
          reject(new Error('aborted'));
        },
        { once: true },
      );

      // Intentionally never resolve to simulate a hung health endpoint.
      void resolve;
    });
  }) as typeof fetch;

  try {
    const stop = startHealthPolling(catalog, 30_000, { healthTimeoutMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();

    const entry = catalog.getAll().find((candidate) => candidate.id === 'svc-a');
    assert.ok(entry);
    assert.equal(entry.status, 'unhealthy');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startHealthPolling skips overlapping runs when checks exceed poll interval', async () => {
  const originalFetch = globalThis.fetch;
  const catalog = new ServiceCatalog();
  catalog.register(buildEntry());
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const stop = startHealthPolling(catalog, 10, { healthTimeoutMs: 500 });
    await new Promise((resolve) => setTimeout(resolve, 135));
    stop();

    assert.ok(calls <= 3, `expected no overlapping runs, got ${calls} fetch calls`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
