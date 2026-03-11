import assert from 'node:assert/strict';
import test from 'node:test';

import { readinessHandler, startupHandler } from './endpoints';
import { HealthRegistry } from './registry';

test('readiness and startup map non-healthy states to 503', async () => {
  const registry = new HealthRegistry();
  registry.register({
    name: 'db',
    check: async () => ({ status: 'degraded', reason: 'lagging replica' }),
  });

  const readiness = await readinessHandler(registry)();
  assert.equal(readiness.status, 503);
  assert.equal(readiness.body.status, 'degraded');

  registry.register({
    name: 'nats',
    check: async () => ({ status: 'unhealthy', reason: 'connection error' }),
  });

  const startup = await startupHandler(registry)();
  assert.equal(startup.status, 503);
  assert.equal(startup.body.status, 'unhealthy');
});
