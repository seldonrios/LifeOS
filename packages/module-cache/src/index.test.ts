import assert from 'node:assert/strict';
import test from 'node:test';

import { CacheManager } from './index';

test('cache manager returns cached value within ttl and expires after ttl', () => {
  let nowMs = 1000;
  const cache = new CacheManager<string>(() => nowMs);
  cache.set('weather:boston', 'cool', 5000);
  assert.equal(cache.get('weather:boston'), 'cool');

  nowMs = 7000;
  assert.equal(cache.get('weather:boston'), null);
});
