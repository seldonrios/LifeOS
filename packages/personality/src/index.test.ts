import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeGraphMemorySearchResult } from '@lifeos/life-graph';

import { Personality } from './index';

function createMockEntry(
  overrides: Partial<LifeGraphMemorySearchResult>,
): LifeGraphMemorySearchResult {
  return {
    id: 'memory_1',
    type: 'preference',
    content: 'communication_style: concise',
    embedding: Array.from({ length: 384 }, () => 0),
    timestamp: '2026-03-25T00:00:00.000Z',
    relatedTo: [],
    score: 0.6,
    ...overrides,
  };
}

test('loadProfile returns defaults when no preferences exist', async () => {
  const personality = new Personality({
    client: {
      async searchMemory() {
        return [];
      },
    } as never,
  });

  const profile = await personality.loadProfile();
  assert.equal(profile.communicationStyle, 'concise and direct');
  assert.deepEqual(profile.priorities, ['health', 'deep work', 'family']);
  assert.deepEqual(profile.quirks, ['hates long briefings', 'loves research rabbit holes']);
});

test('loadProfile maps explicit preference key/value entries', async () => {
  const personality = new Personality({
    client: {
      async searchMemory() {
        return [
          createMockEntry({
            key: 'communication_style',
            value: 'short and direct',
          }),
          createMockEntry({
            id: 'memory_2',
            key: 'priorities',
            value: 'health, family, deep work',
            content: 'priorities: health, family, deep work',
          }),
          createMockEntry({
            id: 'memory_3',
            content: 'quirks: hates long briefings, likes checklists',
          }),
        ];
      },
    } as never,
  });

  const profile = await personality.loadProfile();
  assert.equal(profile.communicationStyle, 'short and direct');
  assert.deepEqual(profile.priorities, ['health', 'family', 'deep work']);
  assert.deepEqual(profile.quirks, ['hates long briefings', 'likes checklists']);
});

test('loadProfile resolves latest preference by timestamp when graph memory is available', async () => {
  const personality = new Personality({
    client: {
      async loadGraph() {
        return {
          version: '0.1.0',
          updatedAt: '2026-03-25T10:00:00.000Z',
          plans: [],
          memory: [
            {
              id: 'pref_old',
              type: 'preference',
              content: 'communication_style: verbose',
              key: 'communication_style',
              value: 'verbose',
              embedding: Array.from({ length: 384 }, () => 0),
              timestamp: '2026-03-24T09:00:00.000Z',
              relatedTo: ['personality'],
            },
            {
              id: 'pref_new',
              type: 'preference',
              content: 'communication_style: concise',
              key: 'communication_style',
              value: 'concise',
              embedding: Array.from({ length: 384 }, () => 0),
              timestamp: '2026-03-25T09:00:00.000Z',
              relatedTo: ['personality'],
            },
          ],
        };
      },
      async searchMemory() {
        return [];
      },
    } as never,
  });

  const profile = await personality.loadProfile();
  assert.equal(profile.communicationStyle, 'concise');
});

test('updatePreference persists normalized preference metadata', async () => {
  const appended: Array<Record<string, unknown>> = [];
  const personality = new Personality({
    client: {
      async appendMemoryEntry(entry: Record<string, unknown>) {
        appended.push(entry);
        return {
          ...entry,
          id: 'memory_saved_1',
          type: 'preference',
          timestamp: '2026-03-25T00:00:00.000Z',
          embedding: Array.from({ length: 384 }, () => 0),
          relatedTo: ['personality'],
        };
      },
    } as never,
  });

  const saved = await personality.updatePreference('Communication Style', 'short answers');
  assert.ok(saved);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.key, 'communication_style');
  assert.equal(appended[0]?.value, 'short answers');
  assert.equal(appended[0]?.type, 'preference');
});
