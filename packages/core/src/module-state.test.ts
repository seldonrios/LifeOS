import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readModuleState, setOptionalModuleEnabled } from './module-state';

test('module state enables and disables optional modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifeos-core-module-state-'));
  const path = join(dir, 'modules.json');

  const empty = await readModuleState({ statePath: path });
  assert.deepEqual(empty.enabledOptionalModules, []);

  const enabled = await setOptionalModuleEnabled('research', true, { statePath: path });
  assert.deepEqual(enabled.enabledOptionalModules, ['research']);

  const disabled = await setOptionalModuleEnabled('research', false, { statePath: path });
  assert.deepEqual(disabled.enabledOptionalModules, []);
});
