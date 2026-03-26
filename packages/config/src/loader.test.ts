import assert from 'node:assert/strict';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SecretStore } from '@lifeos/secrets';

import { loadConfig } from './loader';
import { ConfigError } from './types';

const thisFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(thisFile), '../../../');
const localConfigPath = resolve(rootDir, 'config/local.yaml');

class StaticSecretStore implements SecretStore {
  async get(name: string): Promise<string | null> {
    if (name === 'smtp_host') {
      return 'smtp.from.secret-store';
    }
    return null;
  }

  async set(name: string, value: string): Promise<void> {
    void name;
    void value;
  }
}

const missingSecretStore: SecretStore = {
  async get(): Promise<string | null> {
    return null;
  },
  async set() {
    return;
  },
};

async function withLocalConfig(content: string, fn: () => Promise<void>): Promise<void> {
  let original: string | null = null;
  try {
    await access(localConfigPath);
    original = await readFile(localConfigPath, 'utf8');
  } catch {
    original = null;
  }

  await writeFile(localConfigPath, content, 'utf8');

  try {
    await fn();
  } finally {
    if (original === null) {
      await rm(localConfigPath, { force: true });
    } else {
      await writeFile(localConfigPath, original, 'utf8');
    }
  }
}

async function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('loadConfig resolves defaults -> profile -> local -> env -> secret store', async () => {
  await withLocalConfig(
    [
      'profile: assistant',
      'features:',
      '  vision: false',
      'smtp:',
      '  host: "!secret smtp_host"',
      '',
    ].join('\n'),
    async () => {
      await withEnv({ LIFEOS__features__vision: 'true' }, async () => {
        const { config, degraded } = await loadConfig({
          profile: 'multimodal',
          secretStore: new StaticSecretStore(),
        });

        assert.equal(config.profile, 'assistant');
        assert.equal(config.features.vision, true);
        assert.equal(config.smtp.host, 'smtp.from.secret-store');
        assert.deepEqual(degraded, []);
      });
    },
  );
});

test('loadConfig fails fast for invalid env override values', async () => {
  await withEnv({ LIFEOS__features__voice: 'not-a-bool' }, async () => {
    await assert.rejects(() => loadConfig({ profile: 'assistant' }), ConfigError);
  });
});

test('loadConfig tolerates degraded secret-backed required fields at exact degraded paths', async () => {
  await withLocalConfig(
    ['profile: assistant', 'smtp:', '  host: "!secret smtp_host"', ''].join('\n'),
    async () => {
      const { config, degraded, degradedPaths, secretOutcomes } = await loadConfig({
        secretStore: missingSecretStore,
        secretRefs: [
          {
            name: 'smtp_host',
            policy: 'optional',
            configPath: 'smtp.host',
          },
        ],
      });

      assert.equal(config.smtp.host, undefined);
      assert.equal(degraded.length, 1);
      assert.deepEqual(degradedPaths, ['smtp.host']);
      assert.equal(secretOutcomes.length, 1);
      assert.equal(secretOutcomes[0]?.path, 'smtp.host');
      assert.equal(secretOutcomes[0]?.status, 'degraded');
    },
  );
});

test('loadConfig still fails for non-degraded post-resolution schema errors', async () => {
  await withLocalConfig(
    ['profile: assistant', 'smtp:', '  host: "!secret smtp_host"', ''].join('\n'),
    async () => {
      const invalidSecretStore: SecretStore = {
        async get(name: string): Promise<string | null> {
          if (name === 'smtp_host') {
            return '';
          }
          return null;
        },
        async set() {
          return;
        },
      };

      await assert.rejects(
        () =>
          loadConfig({
            secretStore: invalidSecretStore,
            secretRefs: [
              {
                name: 'smtp_host',
                policy: 'optional',
                configPath: 'smtp.host',
              },
            ],
          }),
        ConfigError,
      );
    },
  );
});
