import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLifeGraphClient } from './client';
import { createDeterministicEmbedding, MemoryManager } from './memory';

test('deterministic embeddings are stable and normalized', async () => {
  const one = createDeterministicEmbedding('research grok timeline');
  const two = createDeterministicEmbedding('research grok timeline');
  const magnitude = Math.sqrt(one.reduce((sum, value) => sum + value * value, 0));

  assert.equal(one.length, 384);
  assert.deepEqual(one, two);
  assert.ok(magnitude > 0.99 && magnitude < 1.01);
});

test('memory manager remembers events and returns relevant context', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-memory-test-'));
  const client = createLifeGraphClient({ graphPath: join(tempDir, 'life-graph.json') });
  const manager = new MemoryManager({
    client,
    now: () => new Date('2026-03-24T09:00:00.000Z'),
  });

  await manager.rememberEvent({
    type: 'lifeos.research.completed',
    data: {
      query: 'Grok 4 benchmarks',
      summary: 'Grok 4 has stronger coding outcomes.',
    },
  });

  const context = await manager.getRelevantContext('grok coding outcomes', { limit: 1 });
  assert.equal(context.length, 1);
  assert.match(context[0] ?? '', /grok/i);
});
