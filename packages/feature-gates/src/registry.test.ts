import assert from 'node:assert/strict';
import test from 'node:test';

import { FeatureGateRegistry } from './registry';

test('evaluates profile-aware feature defaults', () => {
  const registry = new FeatureGateRegistry([
    {
      id: 'voice',
      enabled: false,
      profileDefaults: {
        ambient: true,
        minimal: false,
      },
    },
  ]);

  assert.equal(registry.isEnabled('voice', { profile: 'ambient' }), true);
  assert.equal(registry.isEnabled('voice', { profile: 'assistant' }), false);
  assert.equal(registry.isEnabled('missing', { profile: 'ambient' }), false);
});
