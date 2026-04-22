import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import type { GoalPlan } from '@lifeos/life-graph';

import { runCli } from './index';

function createRecordingEventBus(): {
  bus: ManagedEventBus;
  published: Array<{ type: string; data: Record<string, unknown> }>;
} {
  const published: Array<{ type: string; data: Record<string, unknown> }> = [];
  const bus: ManagedEventBus = {
    async publish<T extends Record<string, unknown>>(topic: string, event: BaseEvent<T>) {
      published.push({ type: topic, data: event.data });
    },
    async subscribe() {
      return;
    },
    async close() {
      return;
    },
    getTransport() {
      return 'in-memory';
    },
  };

  return {
    bus,
    published,
  };
}

function sampleHeroPlan(): GoalPlan {
  return {
    id: 'goal_personal_ops_daily',
    title: 'Personal operations daily loop',
    description: 'Capture, triage, plan, execute, and review daily operations.',
    deadline: '2026-04-05',
    createdAt: '2026-03-28T09:00:00.000Z',
    tasks: [
      {
        id: 'task_capture_inbox',
        title: 'Triage captured inputs into actionable items',
        status: 'todo',
        priority: 5,
        dueDate: '2026-03-28',
      },
      {
        id: 'task_schedule_reminders',
        title: 'Schedule reminders for top tasks',
        status: 'todo',
        priority: 4,
        dueDate: '2026-03-29',
      },
    ],
  };
}

test('hero loop integration: goal -> task list -> next -> task complete -> review', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-hero-loop-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const goalStdout: string[] = [];
  const goalExit = await runCli(
    ['goal', 'Capture incoming requests and plan the day', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-03-28T09:00:00.000Z'),
      interpretGoal: async () => sampleHeroPlan(),
      stdout: (message) => {
        goalStdout.push(message);
      },
    },
  );
  assert.equal(goalExit, 0);
  const planned = JSON.parse(goalStdout.join('')) as GoalPlan;
  assert.equal(planned.tasks.length, 2);

  const listStdout: string[] = [];
  const listExit = await runCli(['task', 'list', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      listStdout.push(message);
    },
  });
  assert.equal(listExit, 0);
  const listedTasks = JSON.parse(listStdout.join('')) as Array<{
    id: string;
    title: string;
    status: 'todo' | 'in-progress' | 'done';
  }>;
  assert.equal(listedTasks.length, 2);
  assert.ok(listedTasks.some((task) => task.title.includes('Triage captured inputs')));

  const nextStdout: string[] = [];
  const nextExit = await runCli(['next', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      nextStdout.push(message);
    },
  });
  assert.equal(nextExit, 0);
  const nextActionsPayload = JSON.parse(nextStdout.join('')) as {
    nextActions: string[];
    source: 'heuristic' | 'llm';
  };
  assert.ok(nextActionsPayload.nextActions.length > 0);

  const firstTaskId = listedTasks[0]?.id;
  assert.ok(firstTaskId);

  const completeStdout: string[] = [];
  const completeExit = await runCli(
    ['task', 'complete', firstTaskId ?? '', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        completeStdout.push(message);
      },
    },
  );
  assert.equal(completeExit, 0);
  const completedTask = JSON.parse(completeStdout.join('')) as {
    id: string;
    status: 'done';
  };
  assert.equal(completedTask.status, 'done');

  const reviewStdout: string[] = [];
  const reviewExit = await runCli(
    ['review', '--period', 'daily', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        reviewStdout.push(message);
      },
    },
  );
  assert.equal(reviewExit, 0);
  const reviewPayload = JSON.parse(reviewStdout.join('')) as {
    period: 'daily';
    wins: string[];
    nextActions: string[];
  };
  assert.equal(reviewPayload.period, 'daily');
  assert.equal(Array.isArray(reviewPayload.wins), true);
  assert.equal(Array.isArray(reviewPayload.nextActions), true);

  const listAfterStdout: string[] = [];
  const listAfterExit = await runCli(['task', 'list', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      listAfterStdout.push(message);
    },
  });
  assert.equal(listAfterExit, 0);
  const listedAfter = JSON.parse(listAfterStdout.join('')) as Array<{
    id: string;
    status: 'todo' | 'in-progress' | 'done';
  }>;
  const completedAfter = listedAfter.find((task) => task.id === completedTask.id);
  assert.equal(completedAfter?.status, 'done');
});

test('capture command publishes lifeos.capture.recorded after successful persist', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-hero-loop-capture-event-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };
  const recorder = createRecordingEventBus();

  const exitCode = await runCli(['capture', 'Buy oat milk', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    createEventBusClient: () => recorder.bus,
  });

  assert.equal(exitCode, 0);
  const captureEvent = recorder.published.find(
    (event) => event.type === Topics.lifeos.captureRecorded,
  );
  assert.ok(captureEvent, 'Expected lifeos.capture.recorded to be published');
  assert.equal(captureEvent?.data.content, 'Buy oat milk');
});

test('inbox triage command publishes lifeos.inbox.triaged after successful task triage', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-hero-loop-inbox-event-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };
  const recorder = createRecordingEventBus();
  const captureStdout: string[] = [];

  const captureExitCode = await runCli(['capture', 'Review pipeline status', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    createEventBusClient: () => recorder.bus,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExitCode, 0);

  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };
  const triageExitCode = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      createEventBusClient: () => recorder.bus,
    },
  );

  assert.equal(triageExitCode, 0);
  const triageEvent = recorder.published.find(
    (event) => event.type === Topics.lifeos.inboxTriaged,
  );
  assert.ok(triageEvent, 'Expected lifeos.inbox.triaged to be published');
  assert.equal(triageEvent?.data.action, 'task');
});
