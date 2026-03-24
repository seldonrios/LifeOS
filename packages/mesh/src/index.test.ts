import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MeshRegistry, readMeshState, writeMeshState } from './index';

test('mesh registry joins nodes and resolves capability assignment', () => {
  const registry = new MeshRegistry();
  registry.join({
    nodeId: 'laptop',
    role: 'primary',
    capabilities: ['voice', 'calendar'],
  });
  registry.join({
    nodeId: 'heavy-server',
    role: 'heavy-compute',
    capabilities: ['research'],
  });

  registry.assign('research', 'heavy-server');
  const resolved = registry.resolve('research');
  assert.equal(resolved?.nodeId, 'heavy-server');
});

test('mesh state persists and reloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lifeos-mesh-state-'));
  const path = join(dir, 'mesh.json');

  await writeMeshState(
    {
      nodes: [
        {
          nodeId: 'laptop',
          role: 'primary',
          capabilities: ['voice'],
        },
      ],
      assignments: {
        research: 'laptop',
      },
      updatedAt: new Date().toISOString(),
    },
    { statePath: path },
  );

  const loaded = await readMeshState({ statePath: path });
  assert.equal(loaded.nodes.length, 1);
  assert.equal(loaded.assignments.research, 'laptop');
});

test('mesh registry rejects invalid node identifiers', () => {
  const registry = new MeshRegistry();
  assert.throws(() => {
    registry.join({
      nodeId: 'Bad Node Id',
      role: 'primary',
      capabilities: ['voice'],
    });
  });
});

test('mesh registry rejects assignment when node lacks requested capability', () => {
  const registry = new MeshRegistry();
  registry.join({
    nodeId: 'fallback-node',
    role: 'fallback',
    capabilities: ['voice'],
  });

  assert.throws(() => {
    registry.assign('research', 'fallback-node');
  });
});
