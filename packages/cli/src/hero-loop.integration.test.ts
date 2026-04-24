import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import { createLifeGraphClient, type GoalPlan } from '@lifeos/life-graph';

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

test('hero loop integration: triage planned actions unify task list, next, tick, and complete', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-hero-loop-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureOneStdout: string[] = [];
  const captureOneExit = await runCli(['capture', 'Draft investor update', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureOneStdout.push(message);
    },
  });
  assert.equal(captureOneExit, 0);
  const captureOne = JSON.parse(captureOneStdout.join('')) as { id: string };

  const captureTwoStdout: string[] = [];
  const captureTwoExit = await runCli(['capture', 'Schedule walkthrough', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureTwoStdout.push(message);
    },
  });
  assert.equal(captureTwoExit, 0);
  const captureTwo = JSON.parse(captureTwoStdout.join('')) as { id: string };

  const triageOneStdout: string[] = [];
  const triageOneExit = await runCli(
    ['inbox', 'triage', captureOne.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageOneStdout.push(message);
      },
    },
  );
  assert.equal(triageOneExit, 0);
  const triageOne = JSON.parse(triageOneStdout.join('')) as {
    plannedAction: { id: string; status: 'todo' };
  };

  const triageTwoStdout: string[] = [];
  const triageTwoExit = await runCli(
    ['inbox', 'triage', captureTwo.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageTwoStdout.push(message);
      },
    },
  );
  assert.equal(triageTwoExit, 0);
  const triageTwo = JSON.parse(triageTwoStdout.join('')) as {
    plannedAction: { id: string; status: 'todo' };
  };

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
    status: 'todo' | 'in-progress' | 'done' | 'blocked' | 'cancelled' | 'deferred';
  }>;
  assert.equal(listedTasks.length, 2);
  assert.ok(listedTasks.some((task) => task.id === triageOne.plannedAction.id));
  assert.ok(listedTasks.some((task) => task.id === triageTwo.plannedAction.id));

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
  assert.equal(nextActionsPayload.source, 'heuristic');

  const tickStdout: string[] = [];
  const tickExit = await runCli(['tick', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      tickStdout.push(message);
    },
  });
  assert.equal(tickExit, 0);
  const tickPayload = JSON.parse(tickStdout.join('')) as {
    checkedTasks: number;
    overdueTasks: unknown[];
  };
  assert.equal(tickPayload.checkedTasks, 2);
  assert.equal(tickPayload.overdueTasks.length, 0);

  const completeStdout: string[] = [];
  const completeExit = await runCli(
    ['task', 'complete', triageOne.plannedAction.id, '--json', '--graph-path', graphPath],
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
    source: 'planned-action' | 'task';
  };
  assert.equal(completedTask.status, 'done');
  assert.equal(completedTask.source, 'planned-action');

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
    status: 'todo' | 'in-progress' | 'done' | 'blocked' | 'cancelled' | 'deferred';
  }>;
  assert.equal(listedAfter.length, 1);
  assert.equal(listedAfter[0]?.id, triageTwo.plannedAction.id);
});

test('inbox triage --action plan creates GoalPlan + projected PlannedActions + sets triagedToPlanId', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-inbox-plan-triage-'));
  const graphPath = join(workspace, 'inbox-plan-triage.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };
  const recorder = createRecordingEventBus();

  const sampleHeroPlan = (): GoalPlan => ({
    id: 'goal_plan_triage_1',
    title: 'Plan triage test goal',
    description: 'Project plan subtasks from inbox triage',
    deadline: '2026-04-15',
    createdAt: '2026-04-01T09:00:00.000Z',
    tasks: [
      {
        id: 'task_1',
        title: 'Break down project milestones',
        status: 'todo',
        priority: 4,
        dueDate: '2026-04-10',
      },
      {
        id: 'task_2',
        title: 'Assign owners for milestones',
        status: 'todo',
        priority: 3,
        dueDate: '2026-04-11',
      },
    ],
  });

  const captureStdout: string[] = [];
  const captureExit = await runCli(
    ['capture', 'Plan quarterly launch work', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      createEventBusClient: () => recorder.bus,
      stdout: (message) => {
        captureStdout.push(message);
      },
    },
  );
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'plan', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      createEventBusClient: () => recorder.bus,
      interpretGoal: async () => sampleHeroPlan(),
    },
  );
  assert.equal(triageExit, 0);

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();

  const captureEntry = (graph.captureEntries ?? []).find((entry) => entry.id === capturePayload.id);
  assert.equal(captureEntry?.status, 'triaged');
  assert.ok(captureEntry?.triagedToPlanId);

  const projected = (graph.plannedActions ?? []).filter(
    (action) =>
      action.activationSource === 'goal_projection' &&
      action.planId === captureEntry?.triagedToPlanId,
  );
  assert.equal(projected.length, sampleHeroPlan().tasks.length);
  assert.ok(projected.every((action) => action.dueDate === sampleHeroPlan().deadline));

  const triageEvent = recorder.published.find((event) => event.type === Topics.lifeos.inboxTriaged);
  assert.ok(triageEvent, 'Expected lifeos.inbox.triaged event for plan action');
  assert.equal(triageEvent?.data.action, 'plan');
  assert.equal(triageEvent?.data.planId, captureEntry?.triagedToPlanId);
});

test('inbox triage --action task is idempotent on duplicate triage', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-inbox-task-idempotent-'));
  const graphPath = join(workspace, 'inbox-task-idempotent.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Call accountant', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const firstTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
    },
  );
  assert.equal(firstTriageExit, 0);

  const secondTriageStdout: string[] = [];
  const secondTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        secondTriageStdout.push(message);
      },
    },
  );
  assert.equal(secondTriageExit, 0);
  const secondPayload = JSON.parse(secondTriageStdout.join('')) as {
    status: string;
    triagedToActionId: string;
    plannedAction: { id: string };
  };
  assert.equal(secondPayload.status, 'already_triaged');

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  assert.equal((graph.plannedActions ?? []).length, 1);
  assert.equal(secondPayload.triagedToActionId, (graph.plannedActions ?? [])[0]?.id);
  assert.equal(secondPayload.plannedAction.id, (graph.plannedActions ?? [])[0]?.id);
});

test('inbox triage --action plan is idempotent on duplicate triage', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-inbox-plan-idempotent-'));
  const graphPath = join(workspace, 'inbox-plan-idempotent.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const interpretedPlan: GoalPlan = {
    id: 'goal_plan_idempotent_1',
    title: 'Plan idempotent goal',
    description: 'Ensure duplicate plan triage is idempotent',
    deadline: '2026-05-15',
    createdAt: '2026-04-24T09:00:00.000Z',
    tasks: [
      {
        id: 'task_1',
        title: 'Define milestones',
        status: 'todo',
        priority: 3,
        dueDate: '2026-05-10',
      },
    ],
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(
    ['capture', 'Plan fundraising sprint', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        captureStdout.push(message);
      },
    },
  );
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const firstTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'plan', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      interpretGoal: async () => interpretedPlan,
    },
  );
  assert.equal(firstTriageExit, 0);

  const secondTriageStdout: string[] = [];
  const secondTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'plan', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      interpretGoal: async () => interpretedPlan,
      stdout: (message) => {
        secondTriageStdout.push(message);
      },
    },
  );
  assert.equal(secondTriageExit, 0);
  const secondPayload = JSON.parse(secondTriageStdout.join('')) as {
    status: string;
    triagedToPlanId: string;
    plan: { id: string };
  };
  assert.equal(secondPayload.status, 'already_triaged');

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  assert.equal((graph.plans ?? []).length, 1);
  assert.equal(secondPayload.triagedToPlanId, (graph.plans ?? [])[0]?.id);
  assert.equal(secondPayload.plan.id, (graph.plans ?? [])[0]?.id);
});

test('inbox triage --action note is idempotent on duplicate triage', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-inbox-note-idempotent-'));
  const graphPath = join(workspace, 'inbox-note-idempotent.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(
    ['capture', 'Draft meeting retro notes', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        captureStdout.push(message);
      },
    },
  );
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const firstTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'note', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
    },
  );
  assert.equal(firstTriageExit, 0);

  const secondTriageStdout: string[] = [];
  const secondTriageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'note', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        secondTriageStdout.push(message);
      },
    },
  );
  assert.equal(secondTriageExit, 0);
  const secondPayload = JSON.parse(secondTriageStdout.join('')) as {
    status: string;
    triagedToNoteId: string;
    note: { id: string };
  };
  assert.equal(secondPayload.status, 'already_triaged');

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  assert.equal((graph.notes ?? []).length, 1);
  assert.equal(secondPayload.triagedToNoteId, (graph.notes ?? [])[0]?.id);
  assert.equal(secondPayload.note.id, (graph.notes ?? [])[0]?.id);
});

test('goal --save leads to task list visibility via planned actions', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-goal-projection-'));
  const graphPath = join(workspace, 'goal-projection.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const interpretedPlan: GoalPlan = {
    id: 'goal_project_actions',
    title: 'Goal projection integration',
    description: 'Ensure goal subtasks project to planned actions',
    deadline: '2026-04-10',
    createdAt: '2026-04-01T09:00:00.000Z',
    tasks: [
      {
        id: 'task_1',
        title: 'Prepare sprint kickoff brief',
        status: 'todo',
        priority: 4,
        dueDate: '2026-04-08',
      },
      {
        id: 'task_2',
        title: 'Share kickoff deck with team',
        status: 'todo',
        priority: 3,
        dueDate: '2026-04-09',
      },
    ],
  };

  const goalExit = await runCli(['goal', 'Set up kickoff workflow', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-04-01T09:00:00.000Z'),
    interpretGoal: async () => interpretedPlan,
  });
  assert.equal(goalExit, 0);

  const listStdout: string[] = [];
  const listExit = await runCli(['task', 'list', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      listStdout.push(message);
    },
  });
  assert.equal(listExit, 0);

  const listedTasks = JSON.parse(listStdout.join('')) as Array<{ title: string }>;
  assert.ok(listedTasks.some((task) => task.title === 'Prepare sprint kickoff brief'));
  assert.ok(listedTasks.some((task) => task.title === 'Share kickoff deck with team'));

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  const projected = (graph.plannedActions ?? []).filter(
    (action) => action.planId === 'goal_project_actions',
  );
  assert.equal(projected.length, interpretedPlan.tasks.length);
  assert.ok(projected.every((action) => action.activationSource === 'goal_projection'));
  assert.ok(projected.every((action) => action.dueDate === interpretedPlan.deadline));
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

test('tick fires scheduled reminders and publishes reminder fired event', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-reminder-tick-fire-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };
  const recorder = createRecordingEventBus();

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Review launch checklist', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    createEventBusClient: () => recorder.bus,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      createEventBusClient: () => recorder.bus,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T09:00:00.000Z',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      createEventBusClient: () => recorder.bus,
      now: () => new Date('2026-05-01T08:00:00.000Z'),
    },
  );
  assert.equal(remindExit, 0);

  const tickExit = await runCli(['tick', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    createEventBusClient: () => recorder.bus,
    now: () => new Date('2026-05-01T09:05:00.000Z'),
  });
  assert.equal(tickExit, 0);

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  const reminder = graph.reminderEvents[0];
  assert.equal(reminder?.status, 'fired');
  assert.equal(reminder?.firedAt, '2026-05-01T09:05:00.000Z');

  const firedEvent = recorder.published.find((event) => event.type === Topics.lifeos.reminderFired);
  assert.ok(firedEvent, 'Expected lifeos.reminder.fired to be published');
  assert.equal(firedEvent?.data.reminderId, reminder?.id);
});

test('tick reminder firing is idempotent across repeated runs', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-reminder-tick-idempotent-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Check billing sync', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T09:00:00.000Z',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-05-01T08:00:00.000Z'),
    },
  );
  assert.equal(remindExit, 0);

  const firstTick = await runCli(['tick', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-05-01T09:05:00.000Z'),
  });
  assert.equal(firstTick, 0);

  const graphClient = createLifeGraphClient({ graphPath, env });
  const afterFirstTick = await graphClient.loadGraph();
  const firedAt = afterFirstTick.reminderEvents[0]?.firedAt;

  const secondTick = await runCli(['tick', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-05-01T10:00:00.000Z'),
  });
  assert.equal(secondTick, 0);

  const afterSecondTick = await graphClient.loadGraph();
  assert.equal(afterSecondTick.reminderEvents[0]?.status, 'fired');
  assert.equal(afterSecondTick.reminderEvents[0]?.firedAt, firedAt);
});

test('remind ack transitions fired reminder to acknowledged', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-reminder-ack-fired-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Book dentist', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const reminderStdout: string[] = [];
  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T09:00:00.000Z',
      '--json',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-05-01T08:00:00.000Z'),
      stdout: (message) => {
        reminderStdout.push(message);
      },
    },
  );
  assert.equal(remindExit, 0);
  const reminderPayload = JSON.parse(reminderStdout.join('')) as { id: string };

  const tickExit = await runCli(['tick', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-05-01T09:05:00.000Z'),
  });
  assert.equal(tickExit, 0);

  const ackStdout: string[] = [];
  const ackExit = await runCli(['remind', 'ack', reminderPayload.id, '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-05-01T09:10:00.000Z'),
    stdout: (message) => {
      ackStdout.push(message);
    },
  });
  assert.equal(ackExit, 0);
  const ackPayload = JSON.parse(ackStdout.join('')) as { status: string; acknowledgedAt?: string };
  assert.equal(ackPayload.status, 'acknowledged');
  assert.equal(ackPayload.acknowledgedAt, '2026-05-01T09:10:00.000Z');
});

test('remind ack on already acknowledged reminder is a no-op', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-reminder-ack-idempotent-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Confirm payroll run', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const reminderStdout: string[] = [];
  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T09:00:00.000Z',
      '--json',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-05-01T08:00:00.000Z'),
      stdout: (message) => {
        reminderStdout.push(message);
      },
    },
  );
  assert.equal(remindExit, 0);
  const reminderPayload = JSON.parse(reminderStdout.join('')) as { id: string };

  const tickExit = await runCli(['tick', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    now: () => new Date('2026-05-01T09:05:00.000Z'),
  });
  assert.equal(tickExit, 0);

  const firstAckStdout: string[] = [];
  const firstAckExit = await runCli(
    ['remind', 'ack', reminderPayload.id, '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-05-01T09:10:00.000Z'),
      stdout: (message) => {
        firstAckStdout.push(message);
      },
    },
  );
  assert.equal(firstAckExit, 0);
  const firstAckPayload = JSON.parse(firstAckStdout.join('')) as {
    status: string;
    acknowledgedAt?: string;
  };
  assert.equal(firstAckPayload.status, 'acknowledged');

  const secondAckStdout: string[] = [];
  const secondAckExit = await runCli(
    ['remind', 'ack', reminderPayload.id, '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      now: () => new Date('2026-05-01T09:15:00.000Z'),
      stdout: (message) => {
        secondAckStdout.push(message);
      },
    },
  );
  assert.equal(secondAckExit, 0);
  const secondAckPayload = JSON.parse(secondAckStdout.join('')) as {
    status: string;
    acknowledgedAt?: string;
  };
  assert.equal(secondAckPayload.status, 'acknowledged');
  assert.equal(secondAckPayload.acknowledgedAt, firstAckPayload.acknowledgedAt);
});

test('remind ack on scheduled reminder returns an error', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-reminder-ack-scheduled-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Prepare sprint notes', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const reminderStdout: string[] = [];
  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T12:00:00.000Z',
      '--json',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        reminderStdout.push(message);
      },
    },
  );
  assert.equal(remindExit, 0);
  const reminderPayload = JSON.parse(reminderStdout.join('')) as { id: string };

  const ackStderr: string[] = [];
  const ackExit = await runCli(['remind', 'ack', reminderPayload.id, '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stderr: (message) => {
      ackStderr.push(message);
    },
  });
  assert.equal(ackExit, 1);
  assert.ok(ackStderr.join('').includes('ERR_REMINDER_INVALID_STATE'));
});

test('task complete automatically cancels scheduled reminders', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'lifeos-task-complete-reminder-cancel-'));
  const graphPath = join(workspace, 'hero-loop.json');
  const env = {
    HOME: workspace,
    USERPROFILE: workspace,
  };

  const captureStdout: string[] = [];
  const captureExit = await runCli(['capture', 'Finalize release notes', '--json', '--graph-path', graphPath], {
    env,
    cwd: () => workspace,
    stdout: (message) => {
      captureStdout.push(message);
    },
  });
  assert.equal(captureExit, 0);
  const capturePayload = JSON.parse(captureStdout.join('')) as { id: string };

  const triageStdout: string[] = [];
  const triageExit = await runCli(
    ['inbox', 'triage', capturePayload.id, '--action', 'task', '--json', '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExit, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as { plannedAction: { id: string } };

  const reminderStdout: string[] = [];
  const remindExit = await runCli(
    [
      'remind',
      triagePayload.plannedAction.id,
      '--at',
      '2026-05-01T12:00:00.000Z',
      '--json',
      '--graph-path',
      graphPath,
    ],
    {
      env,
      cwd: () => workspace,
      stdout: (message) => {
        reminderStdout.push(message);
      },
    },
  );
  assert.equal(remindExit, 0);
  const reminderPayload = JSON.parse(reminderStdout.join('')) as { id: string };

  const completeExit = await runCli(
    ['task', 'complete', triagePayload.plannedAction.id, '--graph-path', graphPath],
    {
      env,
      cwd: () => workspace,
    },
  );
  assert.equal(completeExit, 0);

  const graphClient = createLifeGraphClient({ graphPath, env });
  const graph = await graphClient.loadGraph();
  const reminder = graph.reminderEvents.find((entry) => entry.id === reminderPayload.id);
  assert.equal(reminder?.status, 'cancelled');
});
