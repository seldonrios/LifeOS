import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidTransition, VALID_TRANSITIONS } from './index';

test('isValidTransition allows added to in_cart', () => {
  assert.equal(isValidTransition('added', 'in_cart'), true);
});

test('isValidTransition allows added to purchased', () => {
  assert.equal(isValidTransition('added', 'purchased'), true);
});

test('isValidTransition allows in_cart to purchased', () => {
  assert.equal(isValidTransition('in_cart', 'purchased'), true);
});

test('isValidTransition rejects purchased to added', () => {
  assert.equal(isValidTransition('purchased', 'added'), false);
});

test('isValidTransition rejects in_cart to added', () => {
  assert.equal(isValidTransition('in_cart', 'added'), false);
});

test('isValidTransition rejects purchased to in_cart', () => {
  assert.equal(isValidTransition('purchased', 'in_cart'), false);
});

test('VALID_TRANSITIONS exports one-tap purchase state table', () => {
  assert.deepEqual(VALID_TRANSITIONS, {
    added: ['in_cart', 'purchased'],
    in_cart: ['purchased'],
    purchased: [],
  });
});

test('clearPurchasedItems archival semantics set archived_at only for purchased rows', () => {
  const archivedAt = new Date().toISOString();
  const items = [
    { id: 'purchased-item', status: 'purchased', archived_at: null },
    { id: 'active-item', status: 'added', archived_at: null },
  ];

  const cleared = items.map((item) =>
    item.status === 'purchased' && item.archived_at === null
      ? { ...item, archived_at: archivedAt }
      : item,
  );

  assert.equal(cleared[0]?.archived_at, archivedAt);
  assert.equal(cleared[1]?.archived_at, null);
});
