import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { JwtService } from '@lifeos/security';

import {
  MeshCoordinator,
  MeshRpcClient,
  MeshRpcServer,
  MeshRuntime,
  readMeshHeartbeatState,
  waitForMeshHeartbeat,
} from './runtime';

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

test('mesh rpc server rejects requests without auth token', async () => {
  const server = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58011,
    goalPlanner: async () => ({
      id: 'goal_1',
      title: 'x',
      description: 'x',
      deadline: null,
      tasks: [],
      createdAt: new Date().toISOString(),
    }),
    intentPublisher: async () => undefined,
  });

  await server.start();
  try {
    const response = await fetch('http://127.0.0.1:58011/rpc/goal-plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ goal: 'test' }),
    });
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test('mesh rpc client can call goal-plan with signed jwt', async () => {
  const server = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58012,
    goalPlanner: async (request) => ({
      id: 'goal_remote',
      title: request.goal,
      description: request.goal,
      deadline: null,
      tasks: [],
      createdAt: new Date().toISOString(),
    }),
    intentPublisher: async () => undefined,
  });

  await server.start();
  try {
    const client = new MeshRpcClient(2000);
    const response = await client.goalPlan('http://127.0.0.1:58012', {
      goal: 'Plan quarterly roadmap',
    });
    const plan = response.plan as { title?: string };
    assert.equal(plan.title, 'Plan quarterly roadmap');
  } finally {
    await server.close();
  }
});

test('mesh rpc server rejects intent publish token with wrong scope', async () => {
  const server = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58016,
    goalPlanner: async () => ({ ok: true }),
    intentPublisher: async () => undefined,
  });

  await server.start();
  try {
    const jwt = new JwtService();
    const token = await jwt.issue({
      sub: 'service:test',
      service_id: 'test',
      scopes: ['mesh.goal.plan'],
    });
    const response = await fetch('http://127.0.0.1:58016/rpc/intent-publish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify({
        topic: 'lifeos.voice.intent.research',
        data: { query: 'x' },
      }),
    });
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test('mesh rpc server rejects non-allowlisted intent publish topics', async () => {
  const server = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58017,
    goalPlanner: async () => ({ ok: true }),
    intentPublisher: async () => undefined,
  });

  await server.start();
  try {
    const client = new MeshRpcClient(2000);
    await assert.rejects(async () => {
      await client.intentPublish('http://127.0.0.1:58017', {
        topic: 'lifeos.voice.intent.task.add',
        data: { title: 'x' },
        source: 'test',
      });
    }, /400/);
  } finally {
    await server.close();
  }
});

test('mesh runtime publishes heartbeat and updates local heartbeat cache', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-mesh-runtime-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    LIFEOS_MESH_RPC_PORT: '58013',
    LIFEOS_MESH_HEARTBEAT_INTERVAL_MS: '250',
    LIFEOS_MESH_NODE_TTL_MS: '3000',
  };

  const runtime = new MeshRuntime({
    env,
    node: {
      nodeId: 'heavy-server',
      role: 'heavy-compute',
      capabilities: ['research', 'goal-planning'],
    },
    goalPlanner: async () => ({
      id: 'goal_runtime',
      title: 'runtime',
      description: 'runtime',
      deadline: null,
      tasks: [],
      createdAt: new Date().toISOString(),
    }),
  });

  await runtime.start();
  try {
    const seen = await waitForMeshHeartbeat('heavy-server', {
      env,
      timeoutMs: 4000,
      ttlMs: 3000,
    });
    assert.equal(seen, true);

    const state = await readMeshHeartbeatState({ env, ttlMs: 3000 });
    assert.ok(state.nodes.some((entry) => entry.nodeId === 'heavy-server'));
  } finally {
    await runtime.close();
  }
});

test('mesh coordinator delegates goal planning to selected rpc node', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-mesh-coordinator-'));
  const meshStatePath = join(home, '.lifeos', 'mesh.json');
  const heartbeatPath = join(home, '.lifeos', 'mesh-heartbeats.json');
  await mkdir(join(home, '.lifeos'), { recursive: true });

  await writeFile(
    meshStatePath,
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['goal-planning', 'research'],
            rpcUrl: 'http://127.0.0.1:58014',
          },
        ],
        assignments: {
          'goal-planning': 'heavy-server',
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(
    heartbeatPath,
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['goal-planning', 'research'],
            rpcUrl: 'http://127.0.0.1:58014',
            lastSeenAt: new Date().toISOString(),
          },
        ],
        ttlMs: 3000,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const server = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58014,
    goalPlanner: async (request) => ({
      id: 'goal_coord',
      title: request.goal,
      description: request.goal,
      deadline: null,
      tasks: [],
      createdAt: new Date().toISOString(),
    }),
    intentPublisher: async () => undefined,
  });
  await server.start();
  try {
    const coordinator = new MeshCoordinator({
      env: {
        ...process.env,
        HOME: home,
        LIFEOS_MESH_NODE_TTL_MS: '3000',
        LIFEOS_MESH_DELEGATION_TIMEOUT_MS: '2000',
      },
    });

    const delegated = await coordinator.delegateGoalPlan({
      goal: 'Plan launch',
    });
    assert.equal(delegated.delegated, true);
    const payload = delegated.payload as { title?: string };
    assert.equal(payload.title, 'Plan launch');
    assert.equal(delegated.nodeId, 'heavy-server');
  } finally {
    await server.close();
  }
});

test('mesh coordinator reports no_node when no healthy rpc target exists', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-mesh-coordinator-empty-'));
  const meshStatePath = join(home, '.lifeos', 'mesh.json');
  await mkdir(join(home, '.lifeos'), { recursive: true });
  await writeFile(
    meshStatePath,
    `${JSON.stringify(
      {
        nodes: [],
        assignments: {},
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const coordinator = new MeshCoordinator({
    env: {
      ...process.env,
      HOME: home,
      LIFEOS_MESH_NODE_TTL_MS: '3000',
      LIFEOS_MESH_DELEGATION_TIMEOUT_MS: '1000',
    },
  });
  const delegated = await coordinator.delegateIntentPublish({
    capability: 'research',
    topic: 'lifeos.voice.intent.research',
    data: { query: 'x' },
    source: 'test',
  });
  assert.equal(delegated.delegated, false);
  assert.equal(delegated.reason, 'no_node');
});

test('mesh coordinator enforces jwt secret in production mode', async () => {
  assert.throws(
    () =>
      new MeshCoordinator({
        env: {
          ...process.env,
          NODE_ENV: 'production',
          LIFEOS_JWT_SECRET: '',
        },
      }),
    /LIFEOS_JWT_SECRET is required/i,
  );
});

test('mesh status snapshot includes healthy flags based on ttl', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lifeos-mesh-status-'));
  await mkdir(join(home, '.lifeos'), { recursive: true });

  await writeFile(
    join(home, '.lifeos', 'mesh.json'),
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['research'],
            rpcUrl: 'http://127.0.0.1:58015',
          },
        ],
        assignments: {},
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(
    join(home, '.lifeos', 'mesh-heartbeats.json'),
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['research'],
            rpcUrl: 'http://127.0.0.1:58015',
            lastSeenAt: new Date().toISOString(),
          },
        ],
        ttlMs: 3000,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const coordinator = new MeshCoordinator({
    env: {
      ...process.env,
      HOME: home,
      LIFEOS_MESH_NODE_TTL_MS: '3000',
    },
  });
  const snapshot = await coordinator.getLiveStatus();
  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.nodes[0]?.healthy, true);

  const persistedRaw = await readFile(join(home, '.lifeos', 'mesh-heartbeats.json'), 'utf8');
  const persisted = parseJson<{ nodes: Array<{ nodeId: string }> }>(persistedRaw);
  assert.equal(persisted.nodes[0]?.nodeId, 'heavy-server');
});
