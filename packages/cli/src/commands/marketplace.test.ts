import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { getMarketplaceCatalogStatus, listMarketplaceEntries } from './marketplace';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => key !== 'signature')
    .sort((left, right) => left.localeCompare(right));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function signCatalog(payload: Record<string, unknown>, secret: string): string {
  const digest = createHmac('sha256', secret).update(stableStringify(payload)).digest('base64');
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function withRegistryServer(
  payload: Record<string, unknown>,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(`${JSON.stringify(payload)}\n`);
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        resolve(0);
        return;
      }
      resolve(address.port);
    });
  });

  try {
    await run(`http://127.0.0.1:${port}/community-modules.json`);
  } finally {
    await new Promise<void>((resolve) => {
      (server as Server).close(() => resolve());
    });
  }
}

test('marketplace strict trust mode rejects unsigned remote catalogs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-marketplace-strict-'));
  const payload = {
    lastUpdated: '2026-03-25',
    modules: [
      {
        name: 'unsigned-module',
        repo: 'octocat/unsigned-module',
        certified: false,
      },
    ],
  };

  await withRegistryServer(payload, async (sourceUrl) => {
    const entries = await listMarketplaceEntries({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'strict',
      },
      baseDir: home,
    });

    assert.ok(!entries.some((entry) => entry.id === 'unsigned-module'));

    const status = await getMarketplaceCatalogStatus({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'strict',
      },
      baseDir: home,
    });

    const remoteStatus = status.sources.find((source) => source.kind === 'remote');
    assert.ok(remoteStatus);
    assert.equal(remoteStatus?.trusted, false);
    assert.equal(remoteStatus?.count, 0);
    assert.match(remoteStatus?.verificationError ?? '', /missing_signature/i);
  });
});

test('marketplace warn trust mode includes unsigned remote catalogs with warning', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-marketplace-warn-'));
  const payload = {
    lastUpdated: '2026-03-25',
    modules: [
      {
        name: 'warn-module',
        repo: 'octocat/warn-module',
        certified: false,
      },
    ],
  };

  await withRegistryServer(payload, async (sourceUrl) => {
    const entries = await listMarketplaceEntries({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'warn',
      },
      baseDir: home,
    });

    assert.ok(entries.some((entry) => entry.id === 'warn-module'));

    const status = await getMarketplaceCatalogStatus({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'warn',
      },
      baseDir: home,
    });

    const remoteStatus = status.sources.find((source) => source.kind === 'remote');
    assert.ok(remoteStatus);
    assert.equal(remoteStatus?.trusted, false);
    assert.equal(remoteStatus?.count, 1);
  });
});

test('marketplace strict trust mode accepts valid signed remote catalogs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-marketplace-signed-'));
  const unsignedPayload: Record<string, unknown> = {
    lastUpdated: '2026-03-25',
    modules: [
      {
        name: 'signed-module',
        repo: 'octocat/signed-module',
        certified: true,
      },
    ],
  };
  const signatureValue = signCatalog(unsignedPayload, 'secret-key');
  const payload = {
    ...unsignedPayload,
    signature: {
      keyId: 'alpha',
      algorithm: 'hmac-sha256',
      value: signatureValue,
    },
  };

  await withRegistryServer(payload, async (sourceUrl) => {
    const entries = await listMarketplaceEntries({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'strict',
        LIFEOS_MARKETPLACE_TRUST_KEYS: 'alpha:secret-key',
      },
      baseDir: home,
    });

    assert.ok(entries.some((entry) => entry.id === 'signed-module'));

    const status = await getMarketplaceCatalogStatus({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'strict',
        LIFEOS_MARKETPLACE_TRUST_KEYS: 'alpha:secret-key',
      },
      baseDir: home,
    });

    const remoteStatus = status.sources.find((source) => source.kind === 'remote');
    assert.ok(remoteStatus);
    assert.equal(remoteStatus?.trusted, true);
    assert.equal(remoteStatus?.verified, true);
    assert.equal(remoteStatus?.count, 1);
  });
});

test('marketplace off trust mode includes unsigned remote catalogs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-marketplace-off-'));
  const payload = {
    lastUpdated: '2026-03-25',
    modules: [
      {
        name: 'off-mode-module',
        repo: 'octocat/off-mode-module',
        certified: false,
      },
    ],
  };

  await withRegistryServer(payload, async (sourceUrl) => {
    const entries = await listMarketplaceEntries({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'off',
      },
      baseDir: home,
    });

    assert.ok(entries.some((entry) => entry.id === 'off-mode-module'));

    const status = await getMarketplaceCatalogStatus({
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        LIFEOS_MARKETPLACE_SOURCES: sourceUrl,
        LIFEOS_MARKETPLACE_TRUST_MODE: 'off',
      },
      baseDir: home,
    });
    const remoteStatus = status.sources.find((source) => source.kind === 'remote');
    assert.ok(remoteStatus);
    assert.equal(remoteStatus?.trusted, true);
    assert.equal(remoteStatus?.verified, false);
  });
});

test('marketplace merge prefers verified entries over newer unverified entries', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-marketplace-merge-verified-'));

  const unsignedPayload = {
    lastUpdated: '2026-03-26',
    modules: [
      {
        name: 'merge-target',
        repo: 'octocat/unverified-merge-target',
        certified: false,
      },
    ],
  };

  const signedUnsignedPayload: Record<string, unknown> = {
    lastUpdated: '2026-03-25',
    modules: [
      {
        name: 'merge-target',
        repo: 'octocat/verified-merge-target',
        certified: true,
      },
    ],
  };
  const signatureValue = signCatalog(signedUnsignedPayload, 'secret-key');
  const signedPayload = {
    ...signedUnsignedPayload,
    signature: {
      keyId: 'alpha',
      algorithm: 'hmac-sha256',
      value: signatureValue,
    },
  };

  await withRegistryServer(unsignedPayload, async (unsignedUrl) => {
    await withRegistryServer(signedPayload, async (signedUrl) => {
      const entries = await listMarketplaceEntries({
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          LIFEOS_MARKETPLACE_SOURCES: `${unsignedUrl},${signedUrl}`,
          LIFEOS_MARKETPLACE_TRUST_MODE: 'warn',
          LIFEOS_MARKETPLACE_TRUST_KEYS: 'alpha:secret-key',
        },
        baseDir: home,
      });

      const target = entries.find((entry) => entry.id === 'merge-target');
      assert.ok(target);
      assert.equal(target?.repo, 'octocat/verified-merge-target');
    });
  });
});
