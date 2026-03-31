import assert from 'node:assert/strict';
import test from 'node:test';

import type { HouseholdVoiceCaptureCreated } from '@lifeos/contracts';

import {
  chooseDeterministicRoute,
  deterministicCandidates,
  routeHouseholdCapture,
  type AiClassification,
} from './router';

function buildCapture(
  overrides?: Partial<HouseholdVoiceCaptureCreated>,
): HouseholdVoiceCaptureCreated {
  return {
    captureId: 'cap_1',
    householdId: 'house_1',
    actorUserId: 'user_1',
    text: 'add oat milk to the shopping list',
    audioRef: null,
    source: 'mobile',
    createdAt: '2026-03-30T21:00:00.000Z',
    ...overrides,
  };
}

test('shopping deterministic route extracts item title', async () => {
  const result = await routeHouseholdCapture(buildCapture(), { aiEnabled: false });
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'shopping');
  assert.equal(result.route.payload.itemTitle, 'oat milk');
});

test('shopping secondary pattern routes we need phrase', async () => {
  const result = await routeHouseholdCapture(buildCapture({ text: 'we need dish soap and eggs' }), {
    aiEnabled: false,
  });
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'shopping');
  assert.equal(result.route.payload.itemTitle, 'dish soap and eggs');
});

test('reminder deterministic route preserves text and extracts reminder payload', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'remind us to call the plumber tomorrow' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'reminder');
  assert.equal(result.route.payload.text, 'remind us to call the plumber tomorrow');
  assert.equal(result.route.payload.reminderText, 'call the plumber tomorrow');
});

test('set reminder deterministic route matches alternate phrase', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'set a reminder to move laundry in 30 minutes' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'reminder');
  assert.equal(result.route.payload.reminderText, 'move laundry in 30 minutes');
});

test('chore deterministic route extracts someone needs phrase', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'someone needs to vacuum the living room' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'chore');
  assert.equal(result.route.payload.choreTitle, 'vacuum the living room');
});

test('create chore deterministic route extracts explicit title', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'create chore clean the fridge shelves' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'chore');
  assert.equal(result.route.payload.choreTitle, 'clean the fridge shelves');
});

test('note deterministic route extracts note content', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'note that the wifi password is LifeOS2026' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'note');
  assert.equal(result.route.payload.noteBody, 'the wifi password is LifeOS2026');
});

test('remember deterministic route maps to note intent', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'remember that trash day is Thursday' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'note');
  assert.equal(result.route.payload.noteBody, 'trash day is Thursday');
});

test('deterministic tie resolves with target hint tiebreaker', () => {
  const candidates = deterministicCandidates('can someone remember to buy detergent');
  const chosen = chooseDeterministicRoute(candidates, 'note');
  assert.ok(chosen);
  assert.equal(chosen?.ambiguous, false);
  if (!chosen || chosen.ambiguous) {
    return;
  }
  assert.equal(chosen.route.kind, 'note');
});

test('deterministic tie without hint remains ambiguous', () => {
  const candidates = deterministicCandidates('can someone remember to buy detergent');
  const chosen = chooseDeterministicRoute(candidates, undefined);
  assert.ok(chosen);
  assert.equal(chosen?.ambiguous, true);
});

test('ordered deterministic rules use first-match precedence over later higher-confidence matches', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'add a chore buy milk to the shopping list' }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'shopping');
});

test('targetHint does not override first-match when there is no same-tier collision', async () => {
  const result = await routeHouseholdCapture(
    buildCapture({
      text: 'add oat milk to the shopping list',
      targetHint: 'chore',
    }),
    { aiEnabled: false },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'shopping');
});

test('ambiguous transcript with ai disabled is unresolved', async () => {
  const result = await routeHouseholdCapture(buildCapture({ text: 'thing for Saturday' }), {
    aiEnabled: false,
  });
  assert.equal(result.status, 'unresolved');
  if (result.status !== 'unresolved') {
    return;
  }
  assert.equal(result.reason, 'deterministic-no-match');
});

test('ai fallback routes when deterministic has no match', async () => {
  const classifyWithAi = async (): Promise<AiClassification> => ({
    kind: 'chore',
    confidence: 0.81,
    extractedText: 'change the air filter',
  });
  const result = await routeHouseholdCapture(
    buildCapture({ text: 'do the thing tomorrow morning' }),
    {
      aiEnabled: true,
      classifyWithAi,
    },
  );
  assert.equal(result.status, 'routed');
  if (result.status !== 'routed') {
    return;
  }
  assert.equal(result.route.kind, 'chore');
  assert.equal(result.route.via, 'ai');
  assert.equal(result.route.payload.choreTitle, 'change the air filter');
});

test('ai low confidence yields unresolved event route', async () => {
  const classifyWithAi = async (): Promise<AiClassification> => ({
    kind: 'shopping',
    confidence: 0.2,
    extractedText: 'bananas',
  });
  const result = await routeHouseholdCapture(buildCapture({ text: 'something groceries maybe' }), {
    aiEnabled: true,
    classifyWithAi,
  });
  assert.equal(result.status, 'unresolved');
  if (result.status !== 'unresolved') {
    return;
  }
  assert.equal(result.reason, 'ai-low-confidence');
});
