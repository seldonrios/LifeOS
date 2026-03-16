import assert from 'node:assert/strict';
import test from 'node:test';

import type { SecretRef, SecretStore } from '@lifeos/secrets';

import { resolveSecretRefs } from './secret-refs';
import { ConfigError } from './types';

class MapSecretStore implements SecretStore {
  constructor(private readonly values: Record<string, string | null>) {}

  async get(name: string): Promise<string | null> {
    return this.values[name] ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    this.values[name] = value;
  }
}

test('resolveSecretRefs keeps undeclared secrets fail-fast', async () => {
  await assert.rejects(
    () =>
      resolveSecretRefs(
        {
          smtp: {
            host: '!secret smtp_host',
          },
        },
        new MapSecretStore({ smtp_host: null }),
      ),
    ConfigError,
  );
});

test('resolveSecretRefs records degraded markers for optional secrets', async () => {
  const secretRefs: SecretRef[] = [
    {
      name: 'vision_api_key',
      policy: 'optional',
      configPath: 'integrations.vision.apiKey',
    },
  ];

  const resolved = await resolveSecretRefs(
    {
      integrations: {
        vision: {
          apiKey: '!secret vision_api_key',
        },
      },
    },
    new MapSecretStore({ vision_api_key: null }),
    secretRefs,
  );

  assert.equal(resolved.config.integrations.vision.apiKey, undefined);
  assert.equal(resolved.degraded.length, 1);
  assert.deepEqual(resolved.degradedPaths, ['integrations.vision.apiKey']);
  assert.equal(resolved.secretOutcomes.length, 1);
  assert.equal(resolved.secretOutcomes[0]?.path, 'integrations.vision.apiKey');
  assert.equal(resolved.secretOutcomes[0]?.status, 'degraded');
  assert.match(resolved.degraded[0]?.reason ?? '', /Optional secret 'vision_api_key' is unavailable/);
});

test('resolveSecretRefs honors feature-gated secret policies', async () => {
  const secretRefs: SecretRef[] = [
    {
      name: 'cloud_llm_key',
      policy: 'required_if_feature_enabled',
      featureGate: 'cloudLlm',
      configPath: 'integrations.llm.apiKey',
    },
  ];

  const resolved = await resolveSecretRefs(
    {
      integrations: {
        llm: {
          apiKey: '!secret cloud_llm_key',
        },
      },
    },
    new MapSecretStore({ cloud_llm_key: null }),
    secretRefs,
    async () => false,
  );

  assert.equal(resolved.config.integrations.llm.apiKey, undefined);
  assert.equal(resolved.degraded.length, 1);
  assert.deepEqual(resolved.degradedPaths, ['integrations.llm.apiKey']);
  assert.equal(resolved.secretOutcomes[0]?.status, 'degraded');
  assert.match(resolved.degraded[0]?.reason ?? '', /feature 'cloudLlm' is disabled/);
});