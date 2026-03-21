import assert from 'node:assert/strict';
import test from 'node:test';

import type { GoalInterpretationPlan } from '@lifeos/goal-engine';

import { runCli } from './index';

function samplePlan(): GoalInterpretationPlan {
  return {
    title: 'Board Meeting Prep',
    description: 'Prepare deck, notes, and decision log.',
    priority: 'high',
    deadline: '2026-03-26',
    subtasks: [
      {
        description: 'Draft board deck',
        dependsOn: [],
        estimatedHours: 2,
      },
    ],
    neededResources: ['Q1 financial summary'],
    relatedAreas: ['work'],
  };
}

test('runCli goal command prints human output and saves by default', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let saved = false;

  const exitCode = await runCli(['goal', 'Prepare', 'for', 'board', 'meeting'], {
    env: {},
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    cwd: () => '/repo',
    interpretGoal: async () => samplePlan(),
    appendGoalPlanRecord: async () => {
      saved = true;
      return {
        id: 'goal_123',
        createdAt: '2026-03-21T14:00:00.000Z',
        input: 'Prepare for board meeting',
        plan: samplePlan(),
      };
    },
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(saved, true);
  assert.match(stdout.join(''), /Planning: Prepare for board meeting/);
  assert.equal(stderr.length, 0);
});

test('runCli --json outputs JSON payload', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--json'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => samplePlan(),
    appendGoalPlanRecord: async () => ({
      id: 'goal_123',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Prepare board meeting',
      plan: samplePlan(),
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  const parsed = JSON.parse(output) as GoalInterpretationPlan;
  assert.equal(parsed.title, 'Board Meeting Prep');
});

test('runCli --no-save skips persistence', async () => {
  let saveCalled = false;

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--no-save'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => samplePlan(),
    appendGoalPlanRecord: async () => {
      saveCalled = true;
      return {
        id: 'goal_123',
        createdAt: '2026-03-21T14:00:00.000Z',
        input: 'Prepare board meeting',
        plan: samplePlan(),
      };
    },
    stdout: () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(saveCalled, false);
});

test('runCli returns non-zero for invalid model output failure', async () => {
  const stderr: string[] = [];
  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => {
      throw new Error('LLM output is not a valid MVP goal plan');
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /not a valid MVP goal plan/i);
});
