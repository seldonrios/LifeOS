import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ConsentManager } from './consent-manager';

test('consent manager persists and reads microphone consent', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-consent-'));
  const consentPath = join(tempDir, 'consent.json');
  const manager = new ConsentManager(consentPath);

  const before = await manager.hasConsent();
  assert.equal(before, false);

  await manager.grantConsent();

  const after = await manager.hasConsent();
  assert.equal(after, true);
});
