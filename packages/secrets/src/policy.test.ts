import assert from 'node:assert/strict';
import test from 'node:test';

import { applySecretPolicy } from './policy';
import { SecretsError } from './types';

test('applies secret policy behavior by tier', () => {
  assert.equal(
    applySecretPolicy(
      { name: 'smtp_password', policy: 'required', configPath: 'smtp.password' },
      'x',
    ),
    'x',
  );

  assert.throws(
    () => applySecretPolicy({ name: 'smtp_password', policy: 'required' }, null),
    SecretsError,
  );

  const optional = applySecretPolicy({ name: 'device_token', policy: 'optional' }, null);
  assert.deepEqual(optional, {
    degraded: true,
    reason: "Optional secret 'device_token' is unavailable.",
  });

  assert.throws(
    () =>
      applySecretPolicy(
        {
          name: 'vision_api_key',
          policy: 'required_if_feature_enabled',
          featureGate: 'vision',
        },
        null,
        true,
      ),
    SecretsError,
  );

  const gatedDisabled = applySecretPolicy(
    {
      name: 'vision_api_key',
      policy: 'required_if_feature_enabled',
      featureGate: 'vision',
    },
    null,
    false,
  );
  assert.deepEqual(gatedDisabled, {
    degraded: true,
    reason: "Secret 'vision_api_key' is not loaded because feature 'vision' is disabled.",
  });
});
