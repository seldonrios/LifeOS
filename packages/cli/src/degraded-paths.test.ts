import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GoalPlanSchema } from '@lifeos/life-graph';

import { runCli } from './index';

const TEST_JWT_SECRET = 'test-secret-for-cli-degraded-paths';
const originalNodeEnv = process.env.NODE_ENV;
const originalAllowInsecureDefault = process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT;
const originalJwtSecret = process.env.LIFEOS_JWT_SECRET;

test.before(() => {
  process.env.NODE_ENV = 'development';
  process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT = 'true';
  process.env.LIFEOS_JWT_SECRET = TEST_JWT_SECRET;
});

test.after(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalAllowInsecureDefault === undefined) {
    delete process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT;
  } else {
    process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT = originalAllowInsecureDefault;
  }

  if (originalJwtSecret === undefined) {
    delete process.env.LIFEOS_JWT_SECRET;
  } else {
    process.env.LIFEOS_JWT_SECRET = originalJwtSecret;
  }
});

test(
  'goal command exits 0 with heuristic plan when Ollama is unreachable (ECONNREFUSED)',
  async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-degraded-'));
    const graphPath = join(tempDir, 'life-graph.json');
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runCli(
        ['goal', 'Plan my week', '--json', '--no-save', '--graph-path', graphPath],
        {
          env: {},
          cwd: () => tempDir,
          now: () => new Date('2026-04-01T10:00:00.000Z'),
          interpretGoal: async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
          },
          createSpinner: () => ({
            start() {
              return this;
            },
            succeed() {
              return this;
            },
            fail() {
              return this;
            },
            stop() {
              return this;
            },
          }),
          stdout: (message) => stdout.push(message),
          stderr: (message) => stderr.push(message),
        },
      );

      assert.equal(exitCode, 0);

      const parsed = JSON.parse(stdout.join('')) as unknown;
      assert.doesNotThrow(() => GoalPlanSchema.parse(parsed));
      assert.ok(Array.isArray((parsed as { tasks?: unknown[] }).tasks));
      assert.ok(((parsed as { tasks?: unknown[] }).tasks ?? []).length >= 1);
      assert.match(stderr.join(''), /local-fallback/i);
      assert.match(stderr.join(''), /Ollama unavailable/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
);

test('goal command still exits 1 for non-connection errors (parse failure)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-degraded-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const exitCode = await runCli(
      ['goal', 'Plan my week', '--json', '--no-save', '--graph-path', graphPath],
      {
        env: {},
        cwd: () => tempDir,
        now: () => new Date('2026-04-01T10:00:00.000Z'),
        interpretGoal: async () => {
          throw new Error('Goal interpretation failed after 3 attempts: validation failed');
        },
        createSpinner: () => ({
          start() {
            return this;
          },
          succeed() {
            return this;
          },
          fail() {
            return this;
          },
          stop() {
            return this;
          },
        }),
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    assert.equal(exitCode, 1);
    assert.match(stderr.join(''), /did not match the expected goal-plan schema/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('goal command still exits 1 for non-connection errors (schema error)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-degraded-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const stderr: string[] = [];

  try {
    const exitCode = await runCli(
      ['goal', 'Plan my week', '--json', '--no-save', '--graph-path', graphPath],
      {
        env: {},
        cwd: () => tempDir,
        now: () => new Date('2026-04-01T10:00:00.000Z'),
        interpretGoal: async () => {
          throw new Error('ZodError: invalid schema');
        },
        createSpinner: () => ({
          start() {
            return this;
          },
          succeed() {
            return this;
          },
          fail() {
            return this;
          },
          stop() {
            return this;
          },
        }),
        stderr: (message) => stderr.push(message),
      },
    );

    assert.equal(exitCode, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('goal command exits 1 when save stage throws ECONNREFUSED (no fallback success)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-degraded-'));
  const graphPath = join(tempDir, 'life-graph.json');
  const stderr: string[] = [];

  try {
    const exitCode = await runCli(
      ['goal', 'Plan my week', '--json', '--graph-path', graphPath],
      {
        env: {},
        cwd: () => tempDir,
        now: () => new Date('2026-04-01T10:00:00.000Z'),
        interpretGoal: async () => ({
          id: 'goal_1',
          title: 'Plan my week',
          description: 'Plan my week',
          deadline: null,
          tasks: [
            {
              id: 'task_1',
              title: 'Work on: Plan my week',
              status: 'todo',
              priority: 3,
            },
          ],
          createdAt: '2026-04-01T10:00:00.000Z',
        }),
        appendGoalPlan: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        },
        appendPlannedAction: async () => {
          return;
        },
        createSpinner: () => ({
          start() {
            return this;
          },
          succeed() {
            return this;
          },
          fail() {
            return this;
          },
          stop() {
            return this;
          },
        }),
        stderr: (message) => stderr.push(message),
      },
    );

    assert.equal(exitCode, 1);
    assert.match(stderr.join(''), /Error:/i);
    assert.doesNotMatch(stderr.join(''), /local-fallback/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
