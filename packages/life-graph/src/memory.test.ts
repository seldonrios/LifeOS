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

test('memory manager supports conversation threads and contextual retrieval', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-memory-test-'));
  const client = createLifeGraphClient({ graphPath: join(tempDir, 'life-graph.json') });
  const manager = new MemoryManager({
    client,
    now: () => new Date('2026-03-25T10:00:00.000Z'),
    threadSummaryTrigger: 3,
    threadSummaryKeep: 2,
  });

  const threadId = await manager.startThread({
    initialMessage: 'Research session starts.',
    role: 'system',
  });
  await manager.addToThread(threadId, {
    role: 'user',
    content: 'I prefer short answers.',
    type: 'preference',
    key: 'communicationStyle',
    value: 'short',
  });
  await manager.addToThread(threadId, {
    role: 'assistant',
    content: 'Understood, I will keep responses short.',
  });
  await manager.addToThread(threadId, {
    role: 'user',
    content: 'Please prioritize health and deep work.',
  });

  const thread = await manager.getThread(threadId, { limit: 20 });
  assert.ok(thread.length >= 4);
  const summaryEntry = thread.find((entry) => entry.summaryOfThreadId === threadId);
  assert.ok(summaryEntry);
  const preferenceEntry = thread.find((entry) => entry.type === 'preference');
  assert.equal(preferenceEntry?.key, 'communicationStyle');
  assert.equal(preferenceEntry?.value, 'short');

  const conversationContext = await manager.getRelevantContextForCurrentConversation(
    'how should we respond',
    {
      threadId,
      limit: 5,
      sinceDays: 7,
    },
  );
  assert.ok(conversationContext.length >= 1);
  assert.match(conversationContext.join('\n'), /short answers|Thread summary/i);
});
