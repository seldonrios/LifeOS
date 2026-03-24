import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { SyncTrustRegistry } from './trust-registry';

test('trust registry creates local keypair and persists trusted peers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifeos-sync-trust-'));
  const trustPath = join(dir, 'mesh-trust.json');
  const registry = new SyncTrustRegistry({
    trustPath,
  });

  const local = await registry.getLocalKeyPair();
  assert.equal(local.algorithm, 'ed25519');
  assert.match(local.publicKey, /BEGIN PUBLIC KEY/);
  assert.match(local.privateKey, /BEGIN PRIVATE KEY/);

  const peer = await registry.upsertTrustedPeer('device-b', local.publicKey, 'Phone');
  assert.equal(peer.deviceId, 'device-b');

  const reloaded = new SyncTrustRegistry({
    trustPath,
  });
  const trusted = await reloaded.getTrustedPeer('device-b');
  assert.ok(trusted);
  assert.equal(trusted?.deviceName, 'Phone');
  assert.equal(trusted?.publicKey.trim(), local.publicKey.trim());
});
