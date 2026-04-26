import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import { MeshRpcServer } from '@lifeos/mesh';
import type {
  GoalPlan,
  LifeGraphDocument,
  LifeGraphReviewInsights,
  LifeGraphSummary,
} from '@lifeos/life-graph';
import { MissingMicrophoneConsentError } from '@lifeos/voice-core';

import { runCli } from './index';
import { printReviewInsights } from './printer';

function samplePlan(): GoalPlan {
  return {
    id: 'goal_123',
    title: 'Board Meeting Prep',
    description: 'Prepare deck, notes, and decision log.',
    deadline: '2026-03-26',
    createdAt: '2026-03-21T14:00:00.000Z',
    tasks: [
      {
        id: 'task_1',
        title: 'Draft board deck',
        status: 'todo',
        priority: 4,
        dueDate: '2026-03-24',
      },
    ],
  };
}

function samplePlanWithTaskCount(taskCount: number, deadline = '2026-03-26'): GoalPlan {
  return {
    id: 'goal_projection_test',
    title: 'Projection Test Plan',
    description: 'Projection helper test plan',
    deadline,
    createdAt: '2026-03-21T14:00:00.000Z',
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      id: `task_${index + 1}`,
      title: `Projected task ${index + 1}`,
      status: 'todo' as const,
      priority: 3,
      dueDate: '2026-03-24',
    })),
  };
}

function sampleSummary(): LifeGraphSummary {
  return {
    version: '0.1.0',
    updatedAt: '2026-03-21T14:00:00.000Z',
    totalPlans: 2,
    totalGoals: 2,
    latestPlanCreatedAt: '2026-03-21T14:00:00.000Z',
    latestGoalCreatedAt: '2026-03-21T14:00:00.000Z',
    recentPlanTitles: ['Board Meeting Prep', 'Quarterly Review'],
    recentGoalTitles: ['Board Meeting Prep', 'Quarterly Review'],
    activeGoals: [
      {
        id: 'goal_123',
        title: 'Board Meeting Prep',
        totalTasks: 4,
        completedTasks: 1,
        priority: 4,
        deadline: '2026-03-26',
      },
    ],
  };
}

function sampleReviewInsights(): LifeGraphReviewInsights {
  return {
    period: 'weekly',
    wins: ['Finished board deck draft'],
    nextActions: ['Schedule rehearsal with leadership'],
    loopSummary: {
      pendingCaptures: 1,
      actionsDueToday: 2,
      unacknowledgedReminders: 0,
      completedActions: ['Finished board deck draft (action_1)'],
      suggestedNextActions: ['Finalize board rehearsal agenda'],
    },
    generatedAt: '2026-03-21T14:00:00.000Z',
    source: 'heuristic',
  };
}

function sampleGraph(): LifeGraphDocument {
  return {
    version: '0.1.0',
    updatedAt: '2026-03-21T14:00:00.000Z',
    plans: [
      {
        id: 'goal_123',
        title: 'Board Meeting Prep',
        description: 'Prepare deck, notes, and decision log.',
        deadline: '2026-03-26',
        createdAt: '2026-03-21T14:00:00.000Z',
        tasks: [
          {
            id: 'task_alpha1234',
            title: 'Draft board deck',
            status: 'todo',
            priority: 5,
            dueDate: '2026-03-20',
          },
        ],
      },
    ],
    plannedActions: [
      {
        id: 'action_board_1',
        title: 'Draft board deck',
        status: 'todo',
        dueDate: '2026-03-20',
        planId: 'goal_123',
      },
    ],
  };
}

function createSpinnerRecorder() {
  const calls: string[] = [];
  return {
    calls,
    spinner: {
      start() {
        calls.push('start');
        return this;
      },
      succeed() {
        calls.push('succeed');
        return this;
      },
      fail() {
        calls.push('fail');
        return this;
      },
      stop() {
        calls.push('stop');
        return this;
      },
    },
  };
}

function createMockEventBus() {
  const published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];

  const bus: ManagedEventBus = {
    async publish(topic, event) {
      published.push({ topic, event: event as BaseEvent<unknown> });
    },
    async subscribe() {
      return;
    },
    async close() {
      return;
    },
    getTransport() {
      return 'unknown';
    },
  };

  return { bus, published };
}

test('goal command prints human output, starts spinner, and saves by default', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let saveCalled = false;
  const spinnerRecorder = createSpinnerRecorder();

  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {},
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    cwd: () => '/repo',
    fileExists: () => true,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => {
      saveCalled = true;
      return {
        id: 'goal_123',
        createdAt: '2026-03-21T14:00:00.000Z',
        input: 'Prepare board meeting',
        plan: samplePlan(),
      };
    },
    createSpinner: () => spinnerRecorder.spinner,
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(saveCalled, true);
  assert.deepEqual(spinnerRecorder.calls, ['start', 'succeed', 'stop']);
  assert.match(stdout.join(''), /Plan for:/);
  assert.match(stdout.join(''), /\[saved\]/);
  assert.equal(stderr.length, 0);
});

test('version flag prints version string', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(['--version'], {
    env: {},
    cwd: () => '/repo',
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /\d+\.\d+\.\d+/);
  assert.equal(stderr.length, 0);
});

test('--json outputs only JSON to stdout and suppresses spinner', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let spinnerCreated = 0;

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--json'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => ({
      id: 'goal_123',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Prepare board meeting',
      plan: samplePlan(),
    }),
    createSpinner: () => {
      spinnerCreated += 1;
      return createSpinnerRecorder().spinner;
    },
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(spinnerCreated, 0);
  const output = stdout.join('');
  const parsed = JSON.parse(output) as GoalPlan;
  assert.equal(parsed.title, 'Board Meeting Prep');
  assert.equal(stderr.length, 0);
});

test('--no-save skips persistence and first-run message', async () => {
  const stdout: string[] = [];
  let saveCalled = false;

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--no-save'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => false,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => {
      saveCalled = true;
      return {
        id: 'goal_123',
        createdAt: '2026-03-21T14:00:00.000Z',
        input: 'Prepare board meeting',
        plan: samplePlan(),
      };
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(saveCalled, false);
  assert.doesNotMatch(stdout.join(''), /Initializing your personal graph/);
});

test('goal save projects subtasks into planned actions with expected mapping', async () => {
  const projectedActions: Array<{
    planId?: string;
    activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
    status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
    dueDate?: string;
  }> = [];
  const plan = samplePlanWithTaskCount(3, '2026-03-30');

  const exitCode = await runCli(['goal', 'Project pipeline tasks'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => plan,
    appendGoalPlan: async () => ({
      id: 'plan_abc',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Project pipeline tasks',
      plan,
    }),
    appendPlannedAction: async (action) => {
      projectedActions.push(action);
    },
    createSpinner: () => createSpinnerRecorder().spinner,
  });

  assert.equal(exitCode, 0);
  assert.equal(projectedActions.length, 3);
  projectedActions.forEach((action) => {
    assert.equal(action.planId, 'plan_abc');
    assert.equal(action.activationSource, 'goal_projection');
    assert.equal(action.status, 'todo');
    assert.equal(action.dueDate, '2026-03-30');
  });
});

test('goal save projects at most 10 subtasks', async () => {
  const projectedActions: Array<{ id: string }> = [];
  const plan = samplePlanWithTaskCount(15);

  const exitCode = await runCli(['goal', 'Project many tasks'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => plan,
    appendGoalPlan: async () => ({
      id: 'plan_many',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Project many tasks',
      plan,
    }),
    appendPlannedAction: async (action) => {
      projectedActions.push({ id: action.id });
    },
    createSpinner: () => createSpinnerRecorder().spinner,
  });

  assert.equal(exitCode, 0);
  assert.equal(projectedActions.length, 10);
});

test('goal --no-save does not project subtasks into planned actions', async () => {
  let projectionCalled = false;

  const exitCode = await runCli(['goal', 'Skip save projection', '--no-save'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => samplePlanWithTaskCount(4),
    appendPlannedAction: async () => {
      projectionCalled = true;
      throw new Error('appendPlannedAction should not be called when --no-save is set');
    },
    createSpinner: () => createSpinnerRecorder().spinner,
  });

  assert.equal(exitCode, 0);
  assert.equal(projectionCalled, false);
});

test('goal save prints projected actions summary line in human output', async () => {
  const stdout: string[] = [];
  const plan = samplePlanWithTaskCount(2);

  const exitCode = await runCli(['goal', 'Projection summary test'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => plan,
    appendGoalPlan: async () => ({
      id: 'plan_summary',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Projection summary test',
      plan,
    }),
    appendPlannedAction: async () => {
      return;
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Projected \d+ action\(s\) into your task list/);
});

test('goal projection and inbox plan triage projection share mapping semantics', async () => {
  const plan = samplePlanWithTaskCount(3, '2026-04-05');
  plan.tasks = plan.tasks.map((task, index) => ({
    ...task,
    dueDate: `2026-04-0${index + 1}`,
  }));

  const goalProjectedActions: Array<{
    title: string;
    status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
    activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
    dueDate?: string;
  }> = [];

  const goalExit = await runCli(['goal', 'Projection parity goal'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => plan,
    appendGoalPlan: async () => ({
      id: 'plan_parity_goal',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Projection parity goal',
      plan,
    }),
    appendPlannedAction: async (action) => {
      goalProjectedActions.push(action);
    },
    createSpinner: () => createSpinnerRecorder().spinner,
  });
  assert.equal(goalExit, 0);

  const graph = {
    captureEntries: [
      {
        id: 'capture_parity_1',
        content: 'Projection parity inbox',
        type: 'text' as const,
        capturedAt: '2026-03-21T14:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'pending' as const,
      },
    ],
    plannedActions: [] as Array<{
      id: string;
      title: string;
      status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
      planId?: string;
      activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
      dueDate?: string;
    }>,
  };

  const client = {
    async getCaptureEntry(id: string) {
      return graph.captureEntries.find((entry) => entry.id === id);
    },
    async createNode() {
      return 'plan_parity_inbox';
    },
    async appendPlannedAction(action: (typeof graph.plannedActions)[number]) {
      graph.plannedActions.push(action);
    },
    async updateCaptureEntry(id: string, patch: Partial<{ status: 'pending' | 'triaged'; triagedToPlanId: string }>) {
      const entry = graph.captureEntries.find((item) => item.id === id);
      if (!entry) {
        throw new Error(`CaptureEntry "${id}" not found.`);
      }
      Object.assign(entry, patch);
    },
  };

  const inboxExit = await runCli(
    ['inbox', 'triage', 'capture_parity_1', '--action', 'plan', '--json'],
    {
      createLifeGraphClient: () => client as never,
      interpretGoal: async () => plan,
    },
  );
  assert.equal(inboxExit, 0);

  const normalize = (
    actions: Array<{
      title: string;
      status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
      activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
      dueDate?: string;
    }>,
  ) =>
    actions.map((action) => ({
      title: action.title,
      status: action.status,
      activationSource: action.activationSource,
      dueDate: action.dueDate,
    }));

  assert.deepEqual(normalize(graph.plannedActions), normalize(goalProjectedActions));
});

test('goal save fails clearly when appendGoalPlan is injected without appendPlannedAction', async () => {
  const stderr: string[] = [];
  let createClientCalled = false;
  const plan = samplePlanWithTaskCount(2);

  const exitCode = await runCli(['goal', 'Mixed injection safety check'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => plan,
    appendGoalPlan: async () => ({
      id: 'plan_mixed_injection',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Mixed injection safety check',
      plan,
    }),
    createLifeGraphClient: () => {
      createClientCalled = true;
      throw new Error('createLifeGraphClient should not be called for projection in mixed injection mode');
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(createClientCalled, false);
  assert.match(
    stderr.join(''),
    /appendPlannedAction dependency is required when appendGoalPlan is injected\./,
  );
});

test('--verbose emits safe diagnostics to stderr', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--verbose', '--no-save'], {
    env: { OLLAMA_HOST: 'http://localhost:11434' },
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async (_goal, options) => {
      options.onStage?.('prompt_built');
      options.onStage?.('llm_request_started');
      options.onStage?.('llm_response_received');
      options.onStage?.('plan_parse_started');
      options.onStage?.('plan_parse_succeeded');
      return samplePlan();
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stderr.join('');
  assert.match(output, /model=llama3.1:8b/);
  assert.match(output, /ollama_host=http:\/\/localhost:11434/);
  assert.match(output, /stage=prompt assembled/);
  assert.match(output, /duration_ms=/);
  assert.doesNotMatch(output, /Current local date\/time|User input:/);
});

test('maps Ollama connectivity errors to actionable guidance', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => {
      throw new Error('fetch failed');
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  const output = stderr.join('');
  assert.match(output, /Ollama is not reachable/i);
  assert.match(output, /ollama serve/);
  assert.match(output, /ollama pull llama3.1:8b/);
});

test('maps model-not-found errors to pull guidance', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting', '--model', 'qwen2.5:7b'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => {
      throw new Error("model 'qwen2.5:7b' not found, try pulling it first");
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  const output = stderr.join('');
  assert.match(output, /Model "qwen2.5:7b" is not available/i);
  assert.match(output, /ollama pull qwen2.5:7b/);
});

test('maps parse failures to concise schema guidance', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    interpretGoal: async () => {
      throw new Error('Goal interpretation failed after 3 attempts: validation failed');
    },
    createSpinner: () => createSpinnerRecorder().spinner,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  const output = stderr.join('');
  assert.match(output, /did not match the expected goal-plan schema/i);
  assert.match(output, /Use --verbose/i);
});

test('first run message appears only when default graph path is missing and save is enabled', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => false,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => ({
      id: 'goal_123',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Prepare board meeting',
      plan: samplePlan(),
    }),
    createSpinner: () => createSpinnerRecorder().spinner,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /First run detected\. Initializing your personal graph/);
});

test('uses LIFEOS_GRAPH_PATH when no --graph-path flag is provided', async () => {
  let capturedPath = '';

  const exitCode = await runCli(['goal', 'Prepare board meeting'], {
    env: {
      LIFEOS_GRAPH_PATH: '/custom/graph.json',
    },
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async (_entry, graphPath) => {
      capturedPath = graphPath ?? '';
      return {
        id: 'goal_123',
        createdAt: '2026-03-21T14:00:00.000Z',
        input: 'Prepare board meeting',
        plan: samplePlan(),
      };
    },
    createSpinner: () => createSpinnerRecorder().spinner,
  });

  assert.equal(exitCode, 0);
  assert.equal(capturedPath, '/custom/graph.json');
});

test('--graph-path overrides LIFEOS_GRAPH_PATH', async () => {
  let capturedPath = '';

  const exitCode = await runCli(
    ['goal', 'Prepare board meeting', '--graph-path', '/flag/path.json'],
    {
      env: {
        LIFEOS_GRAPH_PATH: '/custom/graph.json',
      },
      cwd: () => '/repo',
      now: () => new Date('2026-03-21T10:00:00-04:00'),
      fileExists: () => true,
      interpretGoal: async () => samplePlan(),
      appendGoalPlan: async (_entry, graphPath) => {
        capturedPath = graphPath ?? '';
        return {
          id: 'goal_123',
          createdAt: '2026-03-21T14:00:00.000Z',
          input: 'Prepare board meeting',
          plan: samplePlan(),
        };
      },
      createSpinner: () => createSpinnerRecorder().spinner,
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedPath, '/flag/path.json');
});

test('status command prints concise summary in human mode', async () => {
  const stdout: string[] = [];
  const { bus } = createMockEventBus();

  bus.getTransport = () => 'in-memory';

  const exitCode = await runCli(['status'], {
    getGraphSummary: async () => sampleSummary(),
    createEventBusClient: () => bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /LifeOS Status/);
  assert.match(output, /Board Meeting Prep/);
  assert.match(output, /2 total goals/);
  assert.match(output, /Event transport: in-memory/);
  assert.match(output, /Event durability: non-durable process-local fallback/);
});

test('status --json emits summary JSON', async () => {
  const stdout: string[] = [];
  const { bus } = createMockEventBus();

  bus.getTransport = () => 'nats';

  const exitCode = await runCli(['status', '--json'], {
    getGraphSummary: async () => sampleSummary(),
    createEventBusClient: () => bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphSummary & {
    eventTransport: 'nats' | 'in-memory';
    eventDurability: 'external' | 'process-local';
  };
  assert.equal(parsed.version, '0.1.0');
  assert.equal(parsed.totalGoals, 2);
  assert.equal(parsed.activeGoals[0]?.title, 'Board Meeting Prep');
  assert.equal(parsed.eventTransport, 'nats');
  assert.equal(parsed.eventDurability, 'external');
});

test('status --json normalizes unknown transport to in-memory', async () => {
  const stdout: string[] = [];
  const { bus } = createMockEventBus();

  bus.getTransport = () => 'unknown';

  const exitCode = await runCli(['status', '--json'], {
    getGraphSummary: async () => sampleSummary(),
    createEventBusClient: () => bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphSummary & {
    eventTransport: 'nats' | 'in-memory';
    eventDurability: 'external' | 'process-local';
  };
  assert.equal(parsed.eventTransport, 'in-memory');
  assert.equal(parsed.eventDurability, 'process-local');
});

test('status --risks --json emits modularity risk radar payload', async () => {
  const stdout: string[] = [];
  const graph = sampleGraph();

  const exitCode = await runCli(['status', '--risks', '--json'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return graph;
        },
        async saveGraph(nextGraph: typeof graph) {
          Object.assign(graph, nextGraph);
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as {
    modularityRiskRadar: {
      overallHealth: string;
      risks: Array<{ id: number; name: string; status: string }>;
    };
  };
  assert.equal(Array.isArray(parsed.modularityRiskRadar.risks), true);
  assert.equal(parsed.modularityRiskRadar.risks.length, 8);
  assert.equal(typeof parsed.modularityRiskRadar.overallHealth, 'string');
});

test('trust status prints ownership and runtime posture', async () => {
  const stdout: string[] = [];
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-trust-status-'));
  await mkdir(join(baseHome, '.lifeos'), { recursive: true });
  await writeFile(
    join(baseHome, '.lifeos', 'init.json'),
    JSON.stringify(
      {
        model: 'llama3.1:8b',
        ollamaHost: 'http://127.0.0.1:11434',
        natsUrl: 'nats://127.0.0.1:4222',
        voiceEnabled: true,
        localOnlyMode: true,
        cloudAssistEnabled: false,
        trustAuditEnabled: true,
      },
      null,
      2,
    ),
  );

  const exitCode = await runCli(['trust', 'status'], {
    env: {
      HOME: baseHome,
      USERPROFILE: baseHome,
    },
    cwd: () => '/repo',
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /LifeOS Trust Status/);
  assert.match(output, /Your data is yours/i);
  assert.match(output, /Local-first default: yes/);
});

test('trust report --json emits structured trust report', async () => {
  const stdout: string[] = [];
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-trust-report-'));

  const exitCode = await runCli(['trust', 'report', '--json'], {
    env: {
      HOME: baseHome,
      USERPROFILE: baseHome,
      LIFEOS_MODULE_RUNTIME_PERMISSIONS: 'strict',
      LIFEOS_MODULE_MANIFEST_REQUIRED: 'true',
      LIFEOS_POLICY_ENFORCE: 'true',
    },
    cwd: () => '/repo',
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as {
    ownership: { localFirstDefault: boolean };
    runtime: {
      moduleRuntimePermissions: string;
      policyEnforced: boolean;
      storageBackend: string;
      graphPath: string;
      graphDatabasePath: string;
    };
    modules: unknown[];
  };
  assert.equal(parsed.ownership.localFirstDefault, true);
  assert.equal(parsed.runtime.moduleRuntimePermissions, 'strict');
  assert.equal(parsed.runtime.policyEnforced, true);
  assert.equal(parsed.runtime.storageBackend, 'sqlite');
  assert.match(parsed.runtime.graphPath, /life-graph\.json/i);
  assert.match(parsed.runtime.graphDatabasePath, /life-graph\.db/i);
  assert.equal(Array.isArray(parsed.modules), true);
});

test('trust status shows sync authentication override warning when LIFEOS_SYNC_REQUIRE_AUTH=0', async () => {
  const stdout: string[] = [];
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-trust-status-override-'));

  const exitCode = await runCli(['trust', 'status'], {
    env: {
      HOME: baseHome,
      USERPROFILE: baseHome,
      LIFEOS_SYNC_REQUIRE_AUTH: '0',
    },
    cwd: () => '/repo',
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /WARNING:/);
  assert.match(output, /LIFEOS_SYNC_REQUIRE_AUTH=0 disables Ed25519 delta verification/i);
});

test('trust report --json includes sync authentication override warning when active', async () => {
  const stdout: string[] = [];
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-trust-report-override-'));

  const exitCode = await runCli(['trust', 'report', '--json'], {
    env: {
      HOME: baseHome,
      USERPROFILE: baseHome,
      LIFEOS_SYNC_REQUIRE_AUTH: '0',
    },
    cwd: () => '/repo',
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as {
    runtime: {
      syncAuthentication: {
        enabled: boolean;
        overrideActive: boolean;
        warning: string | null;
      };
    };
    warnings: Array<{
      id: string;
      status: string;
      details: string;
    }>;
  };
  assert.equal(parsed.runtime.syncAuthentication.enabled, false);
  assert.equal(parsed.runtime.syncAuthentication.overrideActive, true);
  assert.match(parsed.runtime.syncAuthentication.warning ?? '', /LIFEOS_SYNC_REQUIRE_AUTH=0/i);
  const syncAuthWarning = parsed.warnings.find((warning) => warning.id === 'sync-auth-override');
  assert.ok(syncAuthWarning);
  assert.equal(syncAuthWarning?.status, 'WARN');
  assert.match(syncAuthWarning?.details ?? '', /LIFEOS_SYNC_REQUIRE_AUTH=0/i);
});

test('trust explain emits explanation and trust event', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const { bus, published } = createMockEventBus();

  const exitCode = await runCli(['trust', 'explain', 'goal.plan'], {
    env: {
      LIFEOS_MODULE_RUNTIME_PERMISSIONS: 'strict',
      LIFEOS_POLICY_ENFORCE: 'true',
    },
    cwd: () => '/repo',
    createEventBusClient: () => bus,
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Trust Explanation/);
  assert.equal(published[0]?.topic, Topics.lifeos.trustExplanationLogged);
  assert.equal(stderr.length, 0);
});

test('graph migrate --dry-run --json emits migration preview payload', async () => {
  const stdout: string[] = [];
  let capturedGraphPath = '';

  const exitCode = await runCli(['graph', 'migrate', '--dry-run', '--json'], {
    runGraphMigrations: async (graphPath, options) => {
      capturedGraphPath = graphPath ?? '';
      assert.equal(options?.dryRun, true);
      return {
        currentVersion: '1.0.0',
        targetVersion: '2.0.0',
        migrated: true,
        dryRun: true,
        steps: ['Preview migration step'],
      };
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.ok(capturedGraphPath.length > 0);
  const payload = JSON.parse(stdout.join('')) as {
    migrated: boolean;
    dryRun: boolean;
    targetVersion: string;
  };
  assert.equal(payload.migrated, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.targetVersion, '2.0.0');
});

test('graph migrate prints human summary with backup location', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['graph', 'migrate'], {
    runGraphMigrations: async () => ({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      migrated: true,
      dryRun: false,
      backupPath: '/tmp/lifegraph.backup.json',
      steps: ['Apply metadata migration'],
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /Graph migration applied/);
  assert.match(output, /From: 1.0.0/);
  assert.match(output, /To:\s+2.0.0/);
  assert.match(output, /Backup:/);
});

test('memory status --json emits memory counters', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['memory', 'status', '--json'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: '2026-03-23T08:00:00.000Z',
            plans: [],
            memory: [
              {
                id: 'memory_1',
                type: 'conversation',
                content: 'User asked for a short briefing.',
                embedding: Array.from({ length: 384 }, () => 0),
                timestamp: '2026-03-23T07:50:00.000Z',
                relatedTo: ['voice'],
                threadId: '6dc43712-5709-41de-a4ca-6589f19a8159',
              },
              {
                id: 'memory_2',
                type: 'preference',
                content: 'communication_style: concise',
                key: 'communication_style',
                value: 'concise',
                embedding: Array.from({ length: 384 }, () => 0),
                timestamp: '2026-03-23T07:55:00.000Z',
                relatedTo: ['personality'],
              },
            ],
          };
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    totalEntries: number;
    threadCount: number;
    byType: Record<string, number>;
  };
  assert.equal(payload.totalEntries, 2);
  assert.equal(payload.threadCount, 1);
  assert.equal(payload.byType.preference, 1);
  assert.equal(payload.byType.conversation, 1);
});

test('sync pair and devices commands persist and render paired devices', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-sync-'));
  const pairStdout: string[] = [];
  const listStdout: string[] = [];

  const pairExitCode = await runCli(['sync', 'pair', 'Phone'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      pairStdout.push(message);
    },
  });
  assert.equal(pairExitCode, 0);
  assert.match(pairStdout.join(''), /Paired device: Phone/i);

  const listExitCode = await runCli(['sync', 'devices', '--json'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listStdout.push(message);
    },
  });
  assert.equal(listExitCode, 0);
  const listed = JSON.parse(listStdout.join('')) as {
    localDeviceId: string;
    count: number;
    devices: Array<{ name: string }>;
  };
  assert.ok(listed.localDeviceId.length > 0);
  assert.equal(listed.count, 1);
  assert.equal(listed.devices[0]?.name, 'Phone');
});

test('sync demo simulates mirrored event replication', async () => {
  const stdout: string[] = [];
  const exitCode = await runCli(['sync', 'demo', '--json'], {
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    mirroredEvents: number;
    deltasBroadcast: number;
  };
  assert.equal(payload.mirroredEvents, 1);
  assert.ok(payload.deltasBroadcast >= 1);
});

test('review command prints human insights', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['review', '--period', 'weekly'], {
    generateReview: async () => sampleReviewInsights(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /WEEKLY Review Insights/);
  assert.match(output, /Finished board deck draft/);
  assert.match(output, /Schedule rehearsal with leadership/);
});

test('review --json emits review insight JSON', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['review', '--json', '--period', 'daily'], {
    generateReview: async (period) => ({
      ...sampleReviewInsights(),
      period,
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphReviewInsights;
  assert.equal(parsed.period, 'daily');
  assert.equal(parsed.wins[0], 'Finished board deck draft');
});

test('review --json --period daily includes loopSummary counters', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['review', '--json', '--period', 'daily'], {
    generateReview: async (period) => ({
      ...sampleReviewInsights(),
      period,
      loopSummary: {
        pendingCaptures: 3,
        actionsDueToday: 1,
        unacknowledgedReminders: 2,
        completedActions: ['Send update (action_daily_1)'],
      },
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphReviewInsights;
  assert.equal(parsed.period, 'daily');
  assert.ok(parsed.loopSummary, 'Expected loopSummary on daily review payload');
  assert.equal(parsed.loopSummary?.pendingCaptures, 3);
  assert.equal(parsed.loopSummary?.actionsDueToday, 1);
  assert.equal(parsed.loopSummary?.unacknowledgedReminders, 2);
  assert.deepEqual(parsed.loopSummary?.completedActions, ['Send update (action_daily_1)']);
});

test('review --json --period weekly includes loopSummary and suggestedNextActions', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['review', '--json', '--period', 'weekly'], {
    generateReview: async (period) => ({
      ...sampleReviewInsights(),
      period,
      loopSummary: {
        pendingCaptures: 4,
        actionsDueToday: 5,
        unacknowledgedReminders: 1,
        completedActions: ['Plan retrospective (action_weekly_1)'],
        suggestedNextActions: ['Follow up on overdue budget review'],
      },
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphReviewInsights;
  assert.equal(parsed.period, 'weekly');
  assert.ok(parsed.loopSummary, 'Expected loopSummary on weekly review payload');
  assert.equal(parsed.loopSummary?.pendingCaptures, 4);
  assert.equal(parsed.loopSummary?.actionsDueToday, 5);
  assert.equal(parsed.loopSummary?.unacknowledgedReminders, 1);
  assert.deepEqual(parsed.loopSummary?.completedActions, ['Plan retrospective (action_weekly_1)']);
  assert.deepEqual(parsed.loopSummary?.suggestedNextActions, [
    'Follow up on overdue budget review',
  ]);
});

test('printReviewInsights renders loop summary after wins and next actions', () => {
  const output = printReviewInsights({
    ...sampleReviewInsights(),
    period: 'weekly',
    loopSummary: {
      pendingCaptures: 2,
      actionsDueToday: 3,
      unacknowledgedReminders: 1,
      blockedActions: 2,
      deferredActions: 1,
      completedActions: ['Close sprint retro (action_9)'],
      suggestedNextActions: ['Triage overdue backlog'],
    },
  });

  const winsIndex = output.indexOf('Key Wins:');
  const nextActionsIndex = output.indexOf('Next Actions:');
  const loopSummaryIndex = output.indexOf('Loop Summary:');

  assert.ok(winsIndex >= 0, 'Expected Key Wins section in review output');
  assert.ok(nextActionsIndex > winsIndex, 'Expected Next Actions section after Key Wins');
  assert.ok(
    loopSummaryIndex > nextActionsIndex,
    'Expected Loop Summary section after Next Actions',
  );
  assert.ok(output.includes('Blocked actions: 2'));
  assert.ok(output.includes('Deferred actions: 1'));
});

test('task list --json emits flattened task rows', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['task', 'list', '--json'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return sampleGraph();
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const rows = JSON.parse(stdout.join('')) as Array<{ id: string; planId?: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.planId, 'goal_123');
});

test('task complete updates task status via saveGraph', async () => {
  const stdout: string[] = [];
  let savedGraph: LifeGraphDocument = sampleGraph();
  const eventBus = createMockEventBus();

  const exitCode = await runCli(['task', 'complete', 'task_alpha'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return sampleGraph();
        },
        async saveGraph(graph: LifeGraphDocument) {
          savedGraph = graph;
        },
      }) as never,
    createEventBusClient: () => eventBus.bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Task .* completed/);
  assert.equal(savedGraph.plans[0]?.tasks[0]?.status, 'done');
  assert.equal(eventBus.published.length, 1);
  assert.equal(eventBus.published[0]?.topic, Topics.lifeos.taskCompleted);
});

test('next command prints next actions', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['next'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return sampleGraph();
        },
        async generateReview() {
          return {
            period: 'daily',
            wins: [],
            nextActions: ['Board Meeting Prep: Draft board deck'],
            loopSummary: {
              pendingCaptures: 0,
              actionsDueToday: 1,
              unacknowledgedReminders: 0,
              completedActions: [],
            },
            generatedAt: '2026-03-21T14:00:00.000Z',
            source: 'heuristic',
          };
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Top Next Actions:/);
  assert.match(stdout.join(''), /Draft board deck/);
});

test('tick --json emits tick result payload', async () => {
  const stdout: string[] = [];
  const eventBus = createMockEventBus();

  const exitCode = await runCli(['tick', '--json'], {
    runTick: async () => ({
      now: '2026-03-22T00:00:00.000Z',
      checkedTasks: 3,
      overdueTasks: [
        {
          id: 'task_1',
          title: 'Draft deck',
          planId: 'goal_1',
          dueDate: '2026-03-21',
        },
      ],
    }),
    createEventBusClient: () => eventBus.bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as { checkedTasks: number; overdueTasks: unknown[] };
  assert.equal(payload.checkedTasks, 3);
  assert.equal(payload.overdueTasks.length, 1);
  assert.equal(eventBus.published.length, 1);
  assert.equal(eventBus.published[0]?.topic, Topics.lifeos.tickOverdue);
});

test('tick human mode shows fallback notice and overdue summary', async () => {
  const stdout: string[] = [];

  const bus: ManagedEventBus = {
    async publish() {
      return;
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

  const exitCode = await runCli(['tick'], {
    runTick: async () => ({
      now: '2026-03-22T00:00:00.000Z',
      checkedTasks: 2,
      overdueTasks: [
        {
          id: 'task_1',
          title: 'Draft deck',
          planId: 'goal_1',
          dueDate: '2026-03-21',
        },
      ],
    }),
    createEventBusClient: () => bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /in-memory fallback mode/i);
  assert.match(output, /Tick complete\. Checked 2 task\(s\), found 1 overdue\./);
  assert.match(output, /task_1/);
});

test('demo runs goal then tick and prints completion guidance', async () => {
  const stdout: string[] = [];
  const spinnerRecorder = createSpinnerRecorder();

  const exitCode = await runCli(['demo'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-21T10:00:00-04:00'),
    fileExists: () => true,
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => ({
      id: 'goal_123',
      createdAt: '2026-03-21T14:00:00.000Z',
      input: 'Prepare taxes by end of month',
      plan: samplePlan(),
    }),
    runTick: async () => ({
      now: '2026-03-22T00:00:00.000Z',
      checkedTasks: 1,
      overdueTasks: [],
    }),
    createSpinner: () => spinnerRecorder.spinner,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /LifeOS Demo Starting/);
  assert.match(output, /Goal planned successfully/);
  assert.match(output, /Tick complete\. Checked 1 task\(s\), no overdue tasks\./);
  assert.match(output, /Demo complete!/);
  assert.match(output, /Next: `lifeos status`, `lifeos task list`, `lifeos modules`/);
});

test('demo --dry-run exits without executing goal/tick flow', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['demo', '--dry-run', '--modules', 'all'], {
    stdout: (message) => {
      stdout.push(message);
    },
    interpretGoal: async () => {
      throw new Error('goal flow should not execute in dry-run');
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Demo dry-run complete/);
});

test('voice demo runs the voice core against a simulated utterance', async () => {
  const stdout: string[] = [];
  const voiceCalls: string[] = [];

  const exitCode = await runCli(['voice', 'demo'], {
    createVoiceCore: () => ({
      async start() {
        return;
      },
      async runDemo(text: string) {
        voiceCalls.push(text);
        return {
          handled: true,
          action: 'task_added',
          responseText: 'Added a task to buy milk.',
          planId: 'goal_voice_1',
          taskId: 'task_buy_milk',
        };
      },
      async close() {
        return;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(voiceCalls, ['Hey LifeOS, add a task to buy milk']);
  const output = stdout.join('');
  assert.match(output, /Voice demo complete/);
  assert.match(output, /task_added/);
  assert.match(output, /Added a task to buy milk/);
});

test('voice demo supports scenario shortcuts', async () => {
  const voiceCalls: string[] = [];

  const exitCode = await runCli(['voice', 'demo', '--scenario', 'research'], {
    createVoiceCore: () => ({
      async start() {
        return;
      },
      async runDemo(text: string) {
        voiceCalls.push(text);
        return {
          handled: true,
          action: 'agent_work_requested',
          responseText: 'Researching quantum computing breakthroughs this year.',
        };
      },
      async close() {
        return;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(voiceCalls, ['Hey LifeOS, research quantum computing breakthroughs this year']);
});

test('voice demo supports proactive scenario shortcut', async () => {
  const voiceCalls: string[] = [];

  const exitCode = await runCli(['voice', 'demo', '--scenario', 'proactive'], {
    createVoiceCore: () => ({
      async start() {
        return;
      },
      async runDemo(text: string) {
        voiceCalls.push(text);
        return {
          handled: true,
          action: 'preference_updated',
          responseText: 'Understood. I will keep responses concise.',
        };
      },
      async close() {
        return;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(voiceCalls, ['Hey LifeOS, I prefer short answers']);
});

test('research command publishes research intent event', async () => {
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];

  const exitCode = await runCli(['research', 'quantum chips'], {
    moduleLoader: {
      async loadMany() {
        return;
      },
      async publish(topic: string, data: Record<string, unknown>) {
        published.push({ topic, data });
        return {
          id: 'evt_research_1',
          type: topic,
          timestamp: '2026-03-23T00:00:00.000Z',
          source: 'lifeos-cli',
          version: '0.1.0',
          data,
        };
      },
      async close() {
        return;
      },
      getModuleIds() {
        return ['research'];
      },
    } as never,
  });

  assert.equal(exitCode, 0);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.topic, Topics.lifeos.voiceIntentResearch);
  assert.equal(published[0]?.data.query, 'quantum chips');
});

test('voice consent grants persistent microphone permission', async () => {
  const stdout: string[] = [];
  let grantCalls = 0;

  const exitCode = await runCli(['voice', 'consent'], {
    grantVoiceConsent: async () => {
      grantCalls += 1;
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(grantCalls, 1);
  assert.match(stdout.join(''), /Microphone access granted permanently/);
});

test('voice calendar mode prints activation message', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['voice', 'calendar'], {
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Voice calendar mode active/);
});

test('voice briefing speaks and prints a daily summary', async () => {
  const stdout: string[] = [];
  const spoken: string[] = [];

  const exitCode = await runCli(['voice', 'briefing'], {
    now: () => new Date('2026-03-23T08:00:00.000Z'),
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: '2026-03-23T08:00:00.000Z',
            plans: [
              {
                id: 'goal_1',
                title: 'Board prep',
                description: 'Prepare board notes',
                deadline: null,
                createdAt: '2026-03-23T07:00:00.000Z',
                tasks: [
                  {
                    id: 'task_1',
                    title: 'Draft deck',
                    status: 'todo',
                    priority: 4,
                    dueDate: '2026-03-24',
                  },
                ],
              },
            ],
            calendarEvents: [
              {
                id: 'evt_1',
                title: 'Team sync',
                start: '2026-03-23T12:00:00.000Z',
                end: '2026-03-23T12:30:00.000Z',
                status: 'confirmed',
              },
            ],
            researchResults: [
              {
                id: 'research_1',
                threadId: 'thread_1',
                query: 'quantum error correction',
                summary: 'Progress improved this quarter.',
                savedAt: '2026-03-23T07:30:00.000Z',
              },
            ],
          };
        },
        async getLatestWeatherSnapshot() {
          return {
            id: 'weather_1',
            location: 'Boston',
            forecast: 'Boston: clear skies with light wind.',
            timestamp: '2026-03-23T07:00:00.000Z',
          };
        },
        async getLatestNewsDigest() {
          return {
            id: 'news_1',
            title: 'Top tech news',
            summary: 'AI chip demand remains elevated.',
            sources: ['https://example.com/news'],
            read: false,
          };
        },
      }) as never,
    createTextToSpeech: () => ({
      async speak(text: string) {
        spoken.push(text);
      },
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(spoken.length, 1);
  assert.match(spoken[0] ?? '', /Here is your LifeOS briefing/i);
  assert.match(spoken[0] ?? '', /Weather:/i);
  assert.match(stdout.join(''), /Voice briefing generated/);
});

test('voice start surfaces consent guidance when permission is missing', async () => {
  const stderr: string[] = [];
  let closed = 0;

  const exitCode = await runCli(['voice', 'start'], {
    createVoiceCore: () => ({
      async start() {
        throw new MissingMicrophoneConsentError();
      },
      async runDemo() {
        return null;
      },
      async close() {
        closed += 1;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(closed, 1);
  assert.match(stderr.join(''), /voice consent/);
});

test('voice start shows active message and waits for signal', async () => {
  const stdout: string[] = [];
  let started = 0;
  let closed = 0;

  const exitCode = await runCli(['voice', 'start'], {
    createVoiceCore: () => ({
      async start() {
        started += 1;
      },
      async runDemo() {
        return null;
      },
      async close() {
        closed += 1;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
    waitForSignal: async () => {
      return;
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(started, 1);
  assert.equal(closed, 1);
  assert.match(stdout.join(''), /LifeOS Voice Core active/);
});

test('voice start does not hang when runtime close times out', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['voice', 'start'], {
    createVoiceCore: () => ({
      async start() {
        return;
      },
      async runDemo() {
        return null;
      },
      async close() {
        await new Promise<void>(() => {
          return;
        });
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
    waitForSignal: async () => {
      return;
    },
    voiceCloseTimeoutMs: 10,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stderr.join(''), /Voice runtime shutdown degraded/i);
});

test('voice start surfaces voice runtime logs by default', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['voice', 'start'], {
    createVoiceCore: (options) => ({
      async start() {
        options.logger?.('🎤 Listening...');
        options.logger?.('You said: "buy milk"');
      },
      async runDemo() {
        return null;
      },
      async close() {
        return;
      },
      getWakePhrase() {
        return 'Hey LifeOS';
      },
    }),
    waitForSignal: async () => {
      return;
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /\[voice\] 🎤 Listening\.\.\./);
  assert.match(output, /\[voice\] You said: "buy milk"/);
});

test('events listen --json prints event lines and exits on signal', async () => {
  const stdout: string[] = [];

  const bus: ManagedEventBus = {
    async publish() {
      return;
    },
    async subscribe(_topic, handler) {
      const typedHandler = handler as (event: BaseEvent<unknown>) => Promise<void>;
      await typedHandler({
        id: 'evt_1',
        type: Topics.lifeos.tickOverdue,
        timestamp: '2026-03-22T00:00:00.000Z',
        source: 'test',
        version: '0.1.0',
        data: {
          checkedTasks: 3,
          overdueTasks: [{ id: 'task_1' }],
        },
      });
    },
    async close() {
      return;
    },
    getTransport() {
      return 'unknown';
    },
  };

  const exitCode = await runCli(['events', 'listen', '--json'], {
    createEventBusClient: () => bus,
    waitForSignal: async () => {
      return;
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const line = stdout.join('').trim();
  const parsed = JSON.parse(line) as BaseEvent<{ checkedTasks: number }>;
  assert.equal(parsed.type, Topics.lifeos.tickOverdue);
  assert.equal(parsed.data.checkedTasks, 3);
});

test('modules command lists loaded modules', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['modules'], {
    moduleLoader: {
      async loadMany() {
        return;
      },
      getModuleIds() {
        return ['reminder'];
      },
      async close() {
        return;
      },
    } as never,
    defaultModules: [
      {
        id: 'reminder',
        async init() {
          return;
        },
      },
    ],
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Loaded modules: reminder/);
});

test('modules load returns error for unknown module id', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['modules', 'load', 'missing'], {
    moduleLoader: {
      async loadMany() {
        return;
      },
      getModuleIds() {
        return ['reminder'];
      },
      async close() {
        return;
      },
      async load() {
        return;
      },
    } as never,
    defaultModules: [
      {
        id: 'reminder',
        async init() {
          return;
        },
      },
    ],
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Unknown module "missing"/);
});

test('module create scaffolds a module with lifeos.json and source template', async () => {
  const stdout: string[] = [];
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-create-'));

  const exitCode = await runCli(['module', 'create', 'my-awesome-module'], {
    env: { GITHUB_USER: 'octocat' },
    cwd: () => baseDir,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Module my-awesome-module created/i);

  const manifest = JSON.parse(
    await readFile(join(baseDir, 'modules', 'my-awesome-module', 'lifeos.json'), 'utf8'),
  ) as {
    name: string;
    author: string;
    resources: { cpu: string; memory: string };
    graphVersion?: string;
  };
  assert.equal(manifest.name, 'my-awesome-module');
  assert.equal(manifest.author, 'octocat');
  assert.equal(manifest.resources.cpu, 'low');
  assert.equal(manifest.resources.memory, 'low');
  assert.equal('graphVersion' in manifest, false);

  const migrationsKeep = await readFile(
    join(baseDir, 'modules', 'my-awesome-module', 'migrations', '.gitkeep'),
    'utf8',
  );
  assert.equal(migrationsKeep, '');

  const readme = await readFile(join(baseDir, 'modules', 'my-awesome-module', 'README.md'), 'utf8');
  assert.match(readme, /Modularity Risk Checklist/);
  assert.match(readme, /module\.my-awesome-module\.success/);
});

test('module validate rejects malformed manifest', async () => {
  const stderr: string[] = [];
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-validate-'));
  const moduleDir = join(baseDir, 'modules', 'bad-module');
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    join(moduleDir, 'lifeos.json'),
    JSON.stringify({
      name: 'Bad Module',
      version: 'not-semver',
      author: '',
      permissions: {
        graph: ['read'],
        network: [],
        voice: [],
        events: ['bad-format'],
      },
      requires: ['lifeos/voice-core'],
      category: 'bad category',
      tags: ['ok'],
    }),
  );

  const exitCode = await runCli(['module', 'validate', 'bad-module'], {
    cwd: () => baseDir,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Manifest invalid/i);
});

test('module validate rejects overly broad publish event permissions', async () => {
  const stderr: string[] = [];
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-validate-'));
  const moduleDir = join(baseDir, 'modules', 'broad-events');
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    join(moduleDir, 'lifeos.json'),
    JSON.stringify({
      name: 'broad-events',
      version: '0.1.0',
      author: 'tester',
      permissions: {
        graph: ['read'],
        network: [],
        voice: [],
        events: ['publish:lifeos.>'],
      },
      requires: ['@lifeos/voice-core@>=0.3.0 <0.4.0'],
      category: 'custom',
      tags: ['ops'],
    }),
  );

  const exitCode = await runCli(['module', 'validate', 'broad-events'], {
    cwd: () => baseDir,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /publish permissions cannot contain "\*" or ">"/i);
});

test('module enable/disable toggles optional module state', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-toggle-'));
  const stdout: string[] = [];

  const enableExit = await runCli(['module', 'enable', 'research'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(enableExit, 0);

  const listOut: string[] = [];
  const listExit = await runCli(['module', 'list'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listOut.push(message);
    },
  });
  assert.equal(listExit, 0);
  assert.match(listOut.join(''), /research \[optional\].*enabled/i);

  const disableExit = await runCli(['module', 'disable', 'research'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(disableExit, 0);
});

test('module enable accepts case-insensitive optional module names', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-enable-case-'));
  const stdout: string[] = [];

  const exitCode = await runCli(['module', 'enable', 'Research'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Optional module "research" enabled/i);
});

test('module enable habit-streak succeeds', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-enable-habit-streak-'));
  const stdout: string[] = [];

  const exitCode = await runCli(['module', 'enable', 'habit-streak'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Optional module "habit-streak" enabled/i);

  const listOut: string[] = [];
  const listExit = await runCli(['module', 'list'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listOut.push(message);
    },
  });

  assert.equal(listExit, 0);
  assert.match(listOut.join(''), /habit-streak \[optional\].*enabled/i);
});

test('module enable supports google-bridge sub-features', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-google-bridge-enable-'));
  const stdout: string[] = [];

  const exitCode = await runCli(['module', 'enable', 'google-bridge', '--sub', 'calendar,tasks'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /google-bridge/i);
  assert.match(stdout.join(''), /calendar, tasks/i);

  const config = JSON.parse(
    await readFile(join(baseHome, '.lifeos', 'modules', 'google-bridge', 'config.json'), 'utf8'),
  ) as {
    enabled: string[];
  };
  assert.deepEqual(config.enabled, ['calendar', 'tasks']);
});

test('module disable supports google-bridge sub-features without disabling module', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-google-bridge-disable-sub-'));
  const stdout: string[] = [];

  const enableExit = await runCli(
    ['module', 'enable', 'google-bridge', '--sub', 'calendar,tasks'],
    {
      env: { HOME: baseHome },
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );
  assert.equal(enableExit, 0);

  const disableExit = await runCli(['module', 'disable', 'google-bridge', '--sub', 'tasks'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(disableExit, 0);
  assert.match(stdout.join(''), /Remaining: calendar/i);

  const config = JSON.parse(
    await readFile(join(baseHome, '.lifeos', 'modules', 'google-bridge', 'config.json'), 'utf8'),
  ) as {
    enabled: string[];
  };
  assert.deepEqual(config.enabled, ['calendar']);
});

test('module disable google-bridge without --sub clears sub-feature config', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-google-bridge-disable-all-'));
  const stdout: string[] = [];

  const enableExit = await runCli(
    ['module', 'enable', 'google-bridge', '--sub', 'calendar,tasks'],
    {
      env: { HOME: baseHome },
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );
  assert.equal(enableExit, 0);

  const disableExit = await runCli(['module', 'disable', 'google-bridge'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(disableExit, 0);

  const config = JSON.parse(
    await readFile(join(baseHome, '.lifeos', 'modules', 'google-bridge', 'config.json'), 'utf8'),
  ) as {
    enabled: string[];
  };
  assert.deepEqual(config.enabled, []);
});

test('module list displays enabled google-bridge sub-features', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-google-bridge-list-'));
  const stdout: string[] = [];

  const enableExit = await runCli(
    ['module', 'enable', 'google-bridge', '--sub', 'calendar,tasks'],
    {
      env: { HOME: baseHome },
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );
  assert.equal(enableExit, 0);

  const listOut: string[] = [];
  const listExit = await runCli(['module', 'list'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listOut.push(message);
    },
  });
  assert.equal(listExit, 0);
  assert.match(listOut.join(''), /google-bridge \[optional\].*sub: calendar, tasks/i);
  assert.match(listOut.join(''), /resource=(low|medium|high)/i);
  assert.match(listOut.join(''), /reminder \[system\].*enabled/i);
  assert.match(listOut.join(''), /personality \[baseline\].*shared-impl: briefing/i);
});

test('module setup email-summarizer configures credentials and enables module', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-email-setup-'));
  const stdout: string[] = [];

  const answers = ['imap.example.com', 'yes', '993', 'alex@example.com', 'app-pass', 'work'];
  const exitCode = await runCli(['module', 'setup', 'email-summarizer'], {
    env: { HOME: baseHome },
    inputPrompt: async () => answers.shift() ?? '',
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Email Summarizer is ready/i);

  const state = JSON.parse(await readFile(join(baseHome, '.lifeos', 'modules.json'), 'utf8')) as {
    enabledOptionalModules: string[];
  };
  assert.ok(state.enabledOptionalModules.includes('email-summarizer'));

  const credentials = JSON.parse(
    await readFile(join(baseHome, '.lifeos', 'secrets', 'email-accounts.json'), 'utf8'),
  ) as Array<{ label: string; host: string; auth: { user: string } }>;
  assert.equal(credentials[0]?.label, 'work');
  assert.equal(credentials[0]?.host, 'imap.example.com');
  assert.equal(credentials[0]?.auth.user, 'alex@example.com');
});

test('module authorize rejects unsupported modules', async () => {
  const stderr: string[] = [];
  const exitCode = await runCli(['module', 'authorize', 'weather'], {
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /google-bridge/i);
});

test('module validate rejects invalid sub-feature names', async () => {
  const stderr: string[] = [];
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-validate-subfeatures-'));
  const moduleDir = join(baseDir, 'modules', 'bridge-module');
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    join(moduleDir, 'lifeos.json'),
    JSON.stringify({
      name: 'bridge-module',
      version: '0.1.0',
      author: 'tester',
      permissions: {
        graph: ['read'],
        network: [],
        voice: [],
        events: ['subscribe:lifeos.tick'],
      },
      resources: {
        cpu: 'low',
        memory: 'low',
      },
      subFeatures: ['Calendar'],
      requires: ['@lifeos/voice-core@>=0.3.0 <0.4.0'],
      category: 'bridge',
      tags: ['bridge'],
    }),
  );

  const exitCode = await runCli(['module', 'validate', 'bridge-module'], {
    cwd: () => baseDir,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /subFeatures/i);
});

test('module enable accepts deprecated health alias and normalizes to health-tracker', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-enable-missing-'));
  const stdout: string[] = [];

  const exitCode = await runCli(['module', 'enable', 'health'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Optional module "health-tracker" enabled/i);
  assert.match(stdout.join(''), /Alias "health" resolved to canonical module "health-tracker"/i);
});

test('module status resolves health alias to health-tracker details', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-enable-health-tracker-'));
  const stdout: string[] = [];

  const exitCode = await runCli(['module', 'status', 'health'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /health-tracker Status/i);
  assert.match(stdout.join(''), /Requested alias: health/i);
  assert.match(stdout.join(''), /Aliases: health/i);
});

test('module install accepts github repo and auto-enables known optional module', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-install-'));
  const stdout: string[] = [];

  const installExit = await runCli(['module', 'install', 'octocat/research-module'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(installExit, 0);
  assert.match(stdout.join(''), /Installed octocat\/research-module/i);

  const listOut: string[] = [];
  const listExit = await runCli(['module', 'list'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listOut.push(message);
    },
  });
  assert.equal(listExit, 0);
  assert.match(listOut.join(''), /research \[optional\].*enabled/i);
});

test('module install supports health-tracker repository naming and auto-enables the canonical module', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-install-health-tracker-'));
  const stdout: string[] = [];

  const installExit = await runCli(['module', 'install', 'octocat/health-tracker-module'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(installExit, 0);
  assert.match(stdout.join(''), /Installed octocat\/health-tracker-module/i);

  const listOut: string[] = [];
  const listExit = await runCli(['module', 'list'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      listOut.push(message);
    },
  });
  assert.equal(listExit, 0);
  assert.match(listOut.join(''), /health-tracker \[optional\].*enabled/i);
  assert.match(listOut.join(''), /alias: health \(compat\)/i);
});

test('module install rejects malformed repository strings', async () => {
  const stderr: string[] = [];
  const exitCode = await runCli(['module', 'install', 'not-a-valid-repo'], {
    stderr: (message) => {
      stderr.push(message);
    },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /<owner>\/<repo>/i);
});

test('module install rejects invalid local manifest when module exists in workspace', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-install-local-'));
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-install-cwd-'));
  const stderr: string[] = [];
  const moduleDir = join(baseDir, 'modules', 'research');
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    join(moduleDir, 'lifeos.json'),
    JSON.stringify({
      name: 'Research Module',
      version: 'bad-version',
      author: '',
      permissions: {
        graph: ['read'],
        network: [],
        voice: [],
        events: ['subscribe:lifeos.tick'],
      },
      requires: ['@lifeos/life-graph@>=0.3.0 <0.4.0'],
      category: 'custom',
      tags: ['research'],
    }),
  );

  const exitCode = await runCli(['module', 'install', 'octocat/research-module'], {
    env: { HOME: baseHome },
    cwd: () => baseDir,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Local manifest validation failed/i);
});

test('module certify requires installed repository when not in catalog', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-certify-'));
  const stderr: string[] = [];

  const exitCode = await runCli(['module', 'certify', 'octocat/custom-module'], {
    env: { HOME: baseHome },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /not installed/i);
});

test('module certify requires local module sources for automated checks', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-certify-local-'));
  const emptyRepo = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-certify-empty-'));
  const stderr: string[] = [];

  const exitCode = await runCli(['module', 'certify', 'lifeos-community/research-module'], {
    env: { HOME: baseHome },
    cwd: () => emptyRepo,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /automated certification checks require local module sources/i);
});

test('marketplace search returns matching entries', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-mktpl-search-'));
  await writeFile(
    join(baseDir, 'community-modules.json'),
    JSON.stringify(
      {
        modules: [
          {
            name: 'research',
            repo: 'lifeos-community/research-module',
            certified: true,
            category: 'knowledge',
            description: 'Research assistant with local context and follow-up memory.',
            tags: ['research', 'knowledge'],
          },
          {
            name: 'weather',
            repo: 'lifeos-community/weather-module',
            certified: true,
            category: 'utilities',
            description: 'Offline-first weather snapshots.',
            tags: ['weather'],
          },
        ],
      },
      null,
      2,
    ),
  );
  const stdout: string[] = [];
  const exitCode = await runCli(['marketplace', 'search', 'research', '--json'], {
    cwd: () => baseDir,
    env: { HOME: baseDir },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as Array<{ id: string }>;
  assert.ok(payload.some((entry) => entry.id === 'research'));
});

test('marketplace list --certified returns certified entries only', async () => {
  const stdout: string[] = [];
  const exitCode = await runCli(['marketplace', 'list', '--certified', '--json'], {
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as Array<{ id: string; certified: boolean }>;
  assert.ok(payload.length > 0);
  assert.ok(payload.every((entry) => entry.certified));
});

test('marketplace list prints catalog source and freshness metadata', async () => {
  const stdout: string[] = [];
  const exitCode = await runCli(['marketplace', 'list'], {
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /Catalog source:/i);
  assert.match(output, /staleAfter=/i);
});

test('marketplace commands read community-modules.json from cwd', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-marketplace-catalog-'));
  await writeFile(
    join(baseDir, 'community-modules.json'),
    JSON.stringify(
      {
        modules: [
          {
            name: 'sample-module',
            repo: 'octocat/sample-module',
            certified: false,
            category: 'custom',
            tags: ['sample'],
          },
        ],
      },
      null,
      2,
    ),
  );

  const stdout: string[] = [];
  const exitCode = await runCli(['marketplace', 'list', '--json'], {
    cwd: () => baseDir,
    env: {
      HOME: baseDir,
      USERPROFILE: baseDir,
    },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as Array<{ id: string; resourceHint: string }>;
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.id, 'sample-module');
  assert.equal(payload[0]?.resourceHint, 'medium');
});

test('marketplace refresh loads registry from file source and updates local catalog', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-marketplace-refresh-'));
  const sourcePath = join(baseDir, 'source-registry.json');
  await writeFile(
    sourcePath,
    JSON.stringify(
      {
        modules: [
          {
            name: 'fresh-module',
            repo: 'octocat/fresh-module',
            certified: true,
            category: 'custom',
            tags: ['fresh'],
          },
        ],
      },
      null,
      2,
    ),
  );

  const refreshStdout: string[] = [];
  const refreshExit = await runCli(
    ['marketplace', 'refresh', pathToFileURL(sourcePath).href, '--json'],
    {
      cwd: () => baseDir,
      stdout: (message) => {
        refreshStdout.push(message);
      },
    },
  );
  assert.equal(refreshExit, 0);
  const refreshPayload = JSON.parse(refreshStdout.join('')) as { count: number };
  assert.equal(refreshPayload.count, 1);

  const listStdout: string[] = [];
  const listExit = await runCli(['marketplace', 'list', '--json'], {
    cwd: () => baseDir,
    stdout: (message) => {
      listStdout.push(message);
    },
  });
  assert.equal(listExit, 0);
  const listed = JSON.parse(listStdout.join('')) as Array<{ id: string; resourceHint: string }>;
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, 'fresh-module');
  assert.equal(listed[0]?.resourceHint, 'medium');

  const persistedCatalog = JSON.parse(
    await readFile(join(baseDir, 'community-modules.json'), 'utf8'),
  ) as { lastUpdated?: string };
  assert.equal(typeof persistedCatalog.lastUpdated, 'string');
});

test('marketplace search requires a term', async () => {
  const stderr: string[] = [];
  const exitCode = await runCli(['marketplace', 'search'], {
    stderr: (message) => {
      stderr.push(message);
    },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Search term is required/i);
});

test('marketplace compatibility writes matrix payload to output file', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-marketplace-compat-'));
  const outputPath = join(baseDir, 'compatibility-matrix.json');

  const exitCode = await runCli(['marketplace', 'compatibility', '--output', outputPath], {
    cwd: () => baseDir,
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(await readFile(outputPath, 'utf8')) as {
    generatedAt: string;
    total: number;
    modules: Array<{ id: string; repo: string }>;
  };
  assert.equal(typeof payload.generatedAt, 'string');
  assert.equal(Array.isArray(payload.modules), true);
  assert.ok(payload.total >= 0);
});

test('mesh join, assign, and status commands persist node state', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-'));

  const joinExit = await runCli(['mesh', 'join', 'heavy-server'], {
    env: {
      HOME: baseHome,
      LIFEOS_MESH_ROLE: 'heavy-compute',
      LIFEOS_MESH_CAPABILITIES: 'research,llm',
    },
  });
  assert.equal(joinExit, 0);

  const assignExit = await runCli(['mesh', 'assign', 'research', 'heavy-server'], {
    env: { HOME: baseHome },
  });
  assert.equal(assignExit, 0);

  const stdout: string[] = [];
  const statusExit = await runCli(['mesh', 'status', '--json'], {
    env: { HOME: baseHome },
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(statusExit, 0);
  const payload = JSON.parse(stdout.join('')) as {
    nodes: Array<{ nodeId: string; rpcUrl: string; healthy: boolean }>;
    assignments: Record<string, string>;
    ttlMs: number;
    leaderId: string | null;
    term: number;
    leaseUntil: string | null;
    leaderHealthy: boolean;
  };
  assert.ok(payload.nodes.some((node) => node.nodeId === 'heavy-server'));
  assert.ok(payload.nodes.every((node) => typeof node.rpcUrl === 'string'));
  assert.equal(typeof payload.ttlMs, 'number');
  assert.equal(payload.assignments.research, 'heavy-server');
  assert.equal(typeof payload.term, 'number');
});

test('mesh debug writes a bundle with state, heartbeat, and leader snapshots', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-debug-'));
  const bundlePath = join(baseHome, 'mesh-debug.json');

  const joinExit = await runCli(['mesh', 'join', 'debug-node'], {
    env: {
      HOME: baseHome,
      LIFEOS_MESH_ROLE: 'primary',
      LIFEOS_MESH_CAPABILITIES: 'goal-planning,research',
    },
  });
  assert.equal(joinExit, 0);

  const debugExit = await runCli(['mesh', 'debug', '--bundle', bundlePath, '--json'], {
    env: { HOME: baseHome },
  });
  assert.equal(debugExit, 0);

  const payload = JSON.parse(await readFile(bundlePath, 'utf8')) as {
    generatedAt: string;
    paths: { bundlePath: string };
    storedState: { nodes: Array<{ nodeId: string }> };
    heartbeatState: { nodes: Array<{ nodeId: string }> };
    leaderSnapshot: { term: number };
    liveStatus: { nodes: Array<{ nodeId: string }> };
  };
  assert.equal(payload.paths.bundlePath, bundlePath);
  assert.equal(typeof payload.generatedAt, 'string');
  assert.ok(payload.storedState.nodes.some((node) => node.nodeId === 'debug-node'));
  assert.equal(typeof payload.leaderSnapshot.term, 'number');
  assert.equal(Array.isArray(payload.heartbeatState.nodes), true);
  assert.equal(Array.isArray(payload.liveStatus.nodes), true);
});

test('mesh assign rejects capability that target node does not declare', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-capability-'));
  const stderr: string[] = [];

  const joinExit = await runCli(['mesh', 'join', 'fallback-node'], {
    env: {
      HOME: baseHome,
      LIFEOS_MESH_ROLE: 'fallback',
      LIFEOS_MESH_CAPABILITIES: 'voice,calendar',
    },
  });
  assert.equal(joinExit, 0);

  const assignExit = await runCli(['mesh', 'assign', 'research', 'fallback-node'], {
    env: { HOME: baseHome },
    stderr: (message) => {
      stderr.push(message);
    },
  });
  assert.equal(assignExit, 1);
  assert.match(stderr.join(''), /does not declare capability/i);
});

test('mesh start --json performs runtime startup check with heartbeat', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-start-'));
  const stdout: string[] = [];

  const exitCode = await runCli(
    [
      'mesh',
      'start',
      'heavy-server',
      '--json',
      '--role',
      'heavy-compute',
      '--capabilities',
      'goal-planning,research',
      '--rpc-port',
      '58040',
    ],
    {
      env: {
        HOME: baseHome,
        LIFEOS_JWT_SECRET: 'mesh-test-secret',
      },
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    started: boolean;
    heartbeatSeen: boolean;
    nodeId: string;
    status: { nodes: Array<{ nodeId: string }> };
  };
  assert.equal(payload.started, true);
  assert.equal(payload.heartbeatSeen, true);
  assert.equal(payload.nodeId, 'heavy-server');
  assert.ok(payload.status.nodes.some((node) => node.nodeId === 'heavy-server'));
});

test('mesh delegate goal-planning dispatches to a healthy rpc node', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-delegate-'));
  await mkdir(join(baseHome, '.lifeos'), { recursive: true });

  await writeFile(
    join(baseHome, '.lifeos', 'mesh.json'),
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['goal-planning'],
            rpcUrl: 'http://127.0.0.1:58041',
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
    join(baseHome, '.lifeos', 'mesh-heartbeats.json'),
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['goal-planning'],
            rpcUrl: 'http://127.0.0.1:58041',
            lastSeenAt: new Date().toISOString(),
          },
        ],
        ttlMs: 15000,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const rpcServer = new MeshRpcServer({
    host: '127.0.0.1',
    port: 58041,
    goalPlanner: async (request) => ({
      id: 'goal_remote_1',
      title: request.goal,
      description: request.goal,
      deadline: null,
      tasks: [],
      createdAt: new Date().toISOString(),
    }),
    intentPublisher: async () => undefined,
  });
  await rpcServer.start();
  try {
    const stdout: string[] = [];
    const exitCode = await runCli(
      ['mesh', 'delegate', 'goal-planning', '--goal', 'Plan launch', '--json'],
      {
        env: {
          HOME: baseHome,
          LIFEOS_JWT_SECRET: 'mesh-test-secret',
        },
        stdout: (message) => {
          stdout.push(message);
        },
      },
    );

    assert.equal(exitCode, 0);
    const payload = JSON.parse(stdout.join('')) as {
      delegated: boolean;
      nodeId: string;
      payload: { title: string };
    };
    assert.equal(payload.delegated, true);
    assert.equal(payload.nodeId, 'heavy-server');
    assert.equal(payload.payload.title, 'Plan launch');
  } finally {
    await rpcServer.close();
  }
});

test('mesh delegate fails fast when mesh has no healthy leader', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-mesh-delegate-preflight-'));
  await mkdir(join(baseHome, '.lifeos'), { recursive: true });
  const stderr: string[] = [];
  const stdout: string[] = [];

  await writeFile(
    join(baseHome, '.lifeos', 'mesh.json'),
    `${JSON.stringify(
      {
        nodes: [
          {
            nodeId: 'heavy-server',
            role: 'heavy-compute',
            capabilities: ['goal-planning'],
            rpcUrl: 'http://127.0.0.1:58061',
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
    join(baseHome, '.lifeos', 'mesh-heartbeats.json'),
    `${JSON.stringify(
      {
        nodes: [],
        ttlMs: 15000,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const exitCode = await runCli(['mesh', 'delegate', 'goal-planning', '--goal', 'Plan launch'], {
    env: {
      HOME: baseHome,
      LIFEOS_JWT_SECRET: 'mesh-test-secret',
    },
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Mesh delegation preflight rejected/i);
  assert.doesNotMatch(stdout.join(''), /Delegation unavailable/i);
});

test('init command completes successfully with no existing graph', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'lifeos-init-nograph-'));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const spinnerRecorder = createSpinnerRecorder();

  const exitCode = await runCli(['init'], {
    env: { HOME: workspaceRoot },
    cwd: () => workspaceRoot,
    now: () => new Date('2026-03-25T10:00:00.000Z'),
    fileExists: () => false,
    fetchFn: async () =>
      ({
        ok: true,
        status: 200,
        async json() {
          return { models: [{ name: 'llama3.1:8b' }] };
        },
      }) as Response,
    selectPrompt: async () => 'llama3.1:8b',
    confirmPrompt: async () => false,
    checkboxPrompt: async () => [],
    inputPrompt: async () => 'Prepare for the quarterly board meeting',
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => ({
      id: 'goal_init_1',
      createdAt: '2026-03-25T10:00:00.000Z',
      input: 'Prepare for the quarterly board meeting',
      plan: samplePlan(),
    }),
    setOptionalModuleEnabled: async () => undefined,
    createSpinner: () => spinnerRecorder.spinner,
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
    platform: 'linux',
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /LifeOS is ready/);
});

test('init command with existing graph exits cleanly when user declines re-init', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['init'], {
    env: { LIFEOS_GRAPH_PATH: '/repo/life-graph.json' },
    cwd: () => '/repo',
    fileExists: () => true,
    getGraphSummary: async () => sampleSummary(),
    confirmPrompt: async () => false,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /already have a life graph/);
});

test('init --force bypasses the existing-graph guard', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'lifeos-init-force-'));
  const confirmMessages: string[] = [];
  const spinnerRecorder = createSpinnerRecorder();

  const exitCode = await runCli(['init', '--force'], {
    env: { HOME: workspaceRoot },
    cwd: () => workspaceRoot,
    now: () => new Date('2026-03-25T10:00:00.000Z'),
    fileExists: () => true,
    fetchFn: async () =>
      ({
        ok: true,
        status: 200,
        async json() {
          return { models: [{ name: 'llama3.1:8b' }] };
        },
      }) as Response,
    confirmPrompt: async ({ message }) => {
      confirmMessages.push(message);
      return false;
    },
    selectPrompt: async () => 'llama3.1:8b',
    checkboxPrompt: async () => [],
    inputPrompt: async () => 'Prepare for the quarterly board meeting',
    interpretGoal: async () => samplePlan(),
    appendGoalPlan: async () => ({
      id: 'goal_init_force_1',
      createdAt: '2026-03-25T10:00:00.000Z',
      input: 'Prepare for the quarterly board meeting',
      plan: samplePlan(),
    }),
    setOptionalModuleEnabled: async () => undefined,
    createSpinner: () => spinnerRecorder.spinner,
    platform: 'linux',
  });

  assert.equal(exitCode, 0);
  assert.ok(
    !confirmMessages.some((msg) => msg.includes('Re-run setup')),
    'Guard confirm should not be triggered when --force is set',
  );
});

test('init command returns exit code 1 when Ollama is unreachable after retry', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['init'], {
    env: {},
    fileExists: () => false,
    fetchFn: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    },
    confirmPrompt: async () => true,
    stdout: () => undefined,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /Ollama is not reachable/i);
});

test('init --verbose emits [verbose] diagnostics to stderr', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['init', '--verbose'], {
    env: {},
    fileExists: () => false,
    fetchFn: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    },
    confirmPrompt: async () => true,
    stdout: () => undefined,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  const output = stderr.join('');
  assert.match(output, /\[verbose\] graph_path=/);
  assert.match(output, /\[verbose\] base_cwd=/);
  assert.match(output, /\[verbose\] platform=/);
});

test('inbox defaults to list and validates invalid action messaging', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-inbox-parser-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const stdout: string[] = [];
  const stderr: string[] = [];

  const defaultExitCode = await runCli(['inbox', '--graph-path', graphPath], {
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(defaultExitCode, 0);
  assert.match(stdout.join(''), /Inbox is clear/);

  const invalidActionExitCode = await runCli(
    ['inbox', 'invalid-action', '--graph-path', graphPath],
    {
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );
  assert.equal(invalidActionExitCode, 1);
  assert.match(stderr.join(''), /Invalid inbox action "invalid-action"\. Use list or triage\./);

  const invalidTriageActionExitCode = await runCli(
    ['inbox', 'triage', 'capture_123', '--action', 'invalid', '--graph-path', graphPath],
    {
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );
  assert.equal(invalidTriageActionExitCode, 1);
  assert.match(stderr.join(''), /Invalid triage action "invalid"\. Use task, note, defer, or plan\./);
});

test('inbox list supports empty and non-empty human/json outputs', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-inbox-list-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const humanStdout: string[] = [];
  const jsonStdout: string[] = [];

  const emptyHumanExitCode = await runCli(['inbox', 'list', '--graph-path', graphPath], {
    stdout: (message) => {
      humanStdout.push(message);
    },
  });
  assert.equal(emptyHumanExitCode, 0);
  assert.match(humanStdout.join(''), /Inbox is clear/);

  const emptyJsonExitCode = await runCli(['inbox', 'list', '--json', '--graph-path', graphPath], {
    stdout: (message) => {
      jsonStdout.push(message);
    },
  });
  assert.equal(emptyJsonExitCode, 0);
  assert.deepEqual(JSON.parse(jsonStdout.join('')), []);

  const captureA: string[] = [];
  const captureB: string[] = [];
  await runCli(['capture', 'Draft project brief', '--json', '--graph-path', graphPath], {
    stdout: (message) => {
      captureA.push(message);
    },
  });
  await runCli(['capture', 'Book dentist appointment', '--json', '--graph-path', graphPath], {
    stdout: (message) => {
      captureB.push(message);
    },
  });

  humanStdout.length = 0;
  jsonStdout.length = 0;

  const nonEmptyHumanExitCode = await runCli(['inbox', 'list', '--graph-path', graphPath], {
    stdout: (message) => {
      humanStdout.push(message);
    },
  });
  assert.equal(nonEmptyHumanExitCode, 0);
  const humanOutput = humanStdout.join('');
  assert.match(humanOutput, /ID/);
  assert.match(humanOutput, /Content/);
  assert.match(humanOutput, /Draft project brief/);
  assert.match(humanOutput, /Book dentist appointment/);

  const nonEmptyJsonExitCode = await runCli(
    ['inbox', 'list', '--json', '--graph-path', graphPath],
    {
      stdout: (message) => {
        jsonStdout.push(message);
      },
    },
  );
  assert.equal(nonEmptyJsonExitCode, 0);
  const pending = JSON.parse(jsonStdout.join('')) as Array<{ status: string; content: string }>;
  assert.equal(pending.length, 2);
  assert.ok(pending.every((entry) => entry.status === 'pending'));
});

test('inbox triage task writes triagedToActionId lineage', async () => {
  const captureId = 'capture-task-lineage-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Finalize sprint checklist',
        type: 'text' as const,
        capturedAt: '2026-03-29T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'pending' as const,
      },
    ],
    plannedActions: [] as Array<{
      id: string;
      title: string;
      status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
      sourceCapture?: string;
      dueDate?: string;
    }>,
  };
  const client = {
    async getCaptureEntry(id: string) {
      return graph.captureEntries.find((entry) => entry.id === id);
    },
    async appendPlannedAction(action: (typeof graph.plannedActions)[number]) {
      graph.plannedActions.push(action);
    },
    async updateCaptureEntry(
      id: string,
      patch: Partial<{ status: 'pending' | 'triaged'; triagedToActionId: string }>,
    ) {
      const entry = graph.captureEntries.find((item) => item.id === id);
      if (!entry) {
        throw new Error(`CaptureEntry "${id}" not found.`);
      }
      Object.assign(entry, patch);
    },
  };

  const exitCode = await runCli(['inbox', 'triage', captureId, '--action', 'task', '--json'], {
    createLifeGraphClient: () => client as never,
  });

  assert.equal(exitCode, 0);
  assert.equal(graph.plannedActions.length, 1);
  const updatedCapture = graph.captureEntries[0];
  assert.equal(updatedCapture?.status, 'triaged');
  assert.equal(updatedCapture?.triagedToActionId, graph.plannedActions[0]?.id);
});

test('inbox triage note supports --tag and updates capture state', async () => {
  const captureId = 'capture-note-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Idea: automate weekly report',
        type: 'text' as const,
        capturedAt: '2026-03-29T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'pending' as const,
      },
    ],
    notes: [] as Array<{ id: string; title: string; content: string; tags: string[] }>,
    plannedActions: [] as unknown[],
  };
  const client = {
    async getCaptureEntry(id: string) {
      return graph.captureEntries.find((entry) => entry.id === id);
    },
    async appendNote(note: { title: string; content: string; tags: string[] }) {
      const savedNote = { id: 'note_1', ...note };
      graph.notes.push(savedNote);
      return savedNote;
    },
    async updateCaptureEntry(
      id: string,
      patch: Partial<{ status: 'pending' | 'triaged'; tags: string[]; triagedToNoteId: string }>,
    ) {
      const entry = graph.captureEntries.find((item) => item.id === id);
      if (!entry) {
        throw new Error(`CaptureEntry "${id}" not found.`);
      }
      Object.assign(entry, patch);
    },
  };
  const triageStdout: string[] = [];

  const triageExitCode = await runCli(
    [
      'inbox',
      'triage',
      captureId,
      '--action',
      'note',
      '--tag',
      'idea',
      '--tag',
      'weekly',
      '--json',
    ],
    {
      createLifeGraphClient: () => client as never,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(triageExitCode, 0);
  const triagePayload = JSON.parse(triageStdout.join('')) as {
    captureEntry?: { status?: string; id?: string };
  };
  assert.equal(triagePayload.captureEntry?.status, 'triaged');
  assert.equal(triagePayload.captureEntry?.id, captureId);

  const triagedCapture = graph.captureEntries.find((entry) => entry.id === captureId);
  assert.equal(triagedCapture?.status, 'triaged');
  assert.equal(triagedCapture?.triagedToNoteId, 'note_1');
  assert.equal(graph.plannedActions.length, 0);
  const note = graph.notes[0];
  assert.ok(note, 'Expected one note to be created');
  assert.equal(note.id, 'note_1');
  assert.deepEqual(note.tags, ['idea', 'weekly']);
});

test('inbox triage defer creates deferred planned action and writes triagedToActionId', async () => {
  const captureId = 'capture-defer-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Revisit tax strategy',
        type: 'text' as const,
        capturedAt: '2026-03-29T12:00:00.000Z',
        source: 'cli',
        tags: ['finance'],
        status: 'pending' as const,
      },
    ],
    plannedActions: [] as Array<{
      id: string;
      title: string;
      status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
      activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
      sourceCapture?: string;
    }>,
  };
  const client = {
    async getCaptureEntry(id: string) {
      return graph.captureEntries.find((entry) => entry.id === id);
    },
    async appendPlannedAction(action: (typeof graph.plannedActions)[number]) {
      graph.plannedActions.push(action);
    },
    async updateCaptureEntry(
      id: string,
      patch: Partial<{ status: 'pending' | 'triaged'; triagedToActionId: string }>,
    ) {
      const entry = graph.captureEntries.find((item) => item.id === id);
      if (!entry) {
        throw new Error(`CaptureEntry "${id}" not found.`);
      }
      Object.assign(entry, patch);
    },
  };
  const triageStdout: string[] = [];

  const firstDeferExitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'defer', '--json'],
    {
      createLifeGraphClient: () => client as never,
      stdout: (message) => {
        triageStdout.push(message);
      },
    },
  );
  assert.equal(firstDeferExitCode, 0);
  const firstPayload = JSON.parse(triageStdout.join('')) as {
    captureEntry?: { status?: string; triagedToActionId?: string };
    plannedAction?: {
      id: string;
      status: 'todo' | 'done' | 'deferred' | 'blocked' | 'cancelled';
      activationSource?: 'capture_triage' | 'goal_projection' | 'manual' | 'automation';
    };
  };
  assert.equal(firstPayload.captureEntry?.status, 'triaged');
  assert.equal(firstPayload.plannedAction?.status, 'deferred');
  assert.equal(firstPayload.plannedAction?.activationSource, 'capture_triage');
  assert.equal(firstPayload.captureEntry?.triagedToActionId, firstPayload.plannedAction?.id);

  const updatedCapture = graph.captureEntries.find((entry) => entry.id === captureId);
  assert.equal(updatedCapture?.status, 'triaged');
  assert.equal(updatedCapture?.triagedToActionId, firstPayload.plannedAction?.id);
  assert.equal(graph.plannedActions.length, 1);
  assert.equal(graph.plannedActions[0]?.status, 'deferred');
  assert.equal(graph.plannedActions[0]?.activationSource, 'capture_triage');
});

test('inbox triage returns ERR_TRIAGE_LINK_MISSING when triagedToActionId points to missing action in json mode', async () => {
  const captureId = 'capture-triaged-missing-action-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Follow up with vendor',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
        triagedToActionId: 'action_gone',
      },
    ],
    plannedActions: [] as Array<{ id: string; title: string }>,
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'task', '--json'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.join('')) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, 'ERR_TRIAGE_LINK_MISSING');
  assert.equal(stderr.join(''), '');
});

test('inbox triage in json mode returns already_triaged payload when linked action exists', async () => {
  const captureId = 'capture-triaged-existing-action-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Schedule dentist follow-up',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
        triagedToActionId: 'action_123',
      },
    ],
    plannedActions: [
      {
        id: 'action_123',
        title: 'Schedule dentist follow-up',
        status: 'todo' as const,
      },
    ],
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'task', '--json'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    status: string;
    triagedToActionId: string;
    plannedAction: { id: string };
  };
  assert.equal(payload.status, 'already_triaged');
  assert.equal(payload.triagedToActionId, 'action_123');
  assert.equal(payload.plannedAction.id, 'action_123');
  assert.equal(stderr.join(''), '');
});

test('inbox triage returns ERR_TRIAGE_LINK_MISSING when triagedToPlanId points to missing plan in json mode', async () => {
  const captureId = 'capture-triaged-missing-plan-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Build annual operating plan',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
        triagedToPlanId: 'plan_gone',
      },
    ],
    plannedActions: [] as Array<{ id: string; title: string }>,
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'plan', '--json'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.join('')) as {
    error: {
      code: string;
      missingLinkField: string;
      missingLinkId: string;
    };
  };
  assert.equal(payload.error.code, 'ERR_TRIAGE_LINK_MISSING');
  assert.equal(payload.error.missingLinkField, 'triagedToPlanId');
  assert.equal(payload.error.missingLinkId, 'plan_gone');
  assert.equal(stderr.join(''), '');
});

test('inbox triage returns ERR_TRIAGE_LINK_MISSING when triagedToNoteId points to missing note in json mode', async () => {
  const captureId = 'capture-triaged-missing-note-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Summarize key design decisions',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
        triagedToNoteId: 'note_gone',
      },
    ],
    plannedActions: [] as Array<{ id: string; title: string }>,
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'note', '--json'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.join('')) as {
    error: {
      code: string;
      missingLinkField: string;
      missingLinkId: string;
    };
  };
  assert.equal(payload.error.code, 'ERR_TRIAGE_LINK_MISSING');
  assert.equal(payload.error.missingLinkField, 'triagedToNoteId');
  assert.equal(payload.error.missingLinkId, 'note_gone');
  assert.equal(stderr.join(''), '');
});

test('inbox triage returns ERR_TRIAGE_LINK_MISSING when triaged capture has no link fields in json mode', async () => {
  const captureId = 'capture-triaged-no-link-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Resolve stale triage linkage',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
      },
    ],
    plannedActions: [] as Array<{ id: string; title: string }>,
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'task', '--json'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  const payload = JSON.parse(stdout.join('')) as {
    error: {
      code: string;
      missingLinkField: string;
      missingLinkId: string;
    };
  };
  assert.equal(payload.error.code, 'ERR_TRIAGE_LINK_MISSING');
  assert.equal(payload.error.missingLinkField, 'none');
  assert.equal(payload.error.missingLinkId, 'none');
  assert.equal(stderr.join(''), '');
});

test('inbox triage human mode returns ERR_TRIAGE_LINK_MISSING text when link target is missing', async () => {
  const captureId = 'capture-triaged-human-missing-action-1';
  const graph = {
    captureEntries: [
      {
        id: captureId,
        content: 'Review insurance policy',
        type: 'text' as const,
        capturedAt: '2026-04-24T12:00:00.000Z',
        source: 'cli',
        tags: [],
        status: 'triaged' as const,
        triagedToActionId: 'action_missing_human',
      },
    ],
    plannedActions: [] as Array<{ id: string; title: string }>,
    plans: [] as Array<{ id: string; title: string }>,
    notes: [] as Array<{ id: string; title: string; content: string }>,
  };
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', captureId, '--action', 'task'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry(id: string) {
            return graph.captureEntries.find((entry) => entry.id === id);
          },
          async getPlannedAction(id: string) {
            return graph.plannedActions.find((action) => action.id === id);
          },
          async loadGraph() {
            return graph;
          },
        }) as never,
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_TRIAGE_LINK_MISSING/);
});

test('inbox triage failures include stage, reason, and fix diagnostics', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['inbox', 'triage', 'capture-1', '--action', 'defer'], {
    createLifeGraphClient: () =>
      ({
        async getCaptureEntry() {
          return {
            id: 'capture-1',
            content: 'Pay utilities',
            type: 'text',
            capturedAt: '2026-03-29T12:00:00.000Z',
            source: 'cli',
            tags: [],
            status: 'pending',
          };
        },
        async updateCaptureEntry() {
          throw new Error('Disk full while updating capture');
        },
      }) as never,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  const errorOutput = stderr.join('');
  assert.match(errorOutput, /ERR_INBOX_TRIAGE_FAILED:/);
  assert.match(errorOutput, /stage=update_capture/);
  assert.match(errorOutput, /reason=Disk full while updating capture/);
  assert.match(errorOutput, /fix=/);
});

test('inbox triage task validation failures report task stage and task fix guidance', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(
    ['inbox', 'triage', 'capture-1', '--action', 'task', '--due', 'not-a-date'],
    {
      createLifeGraphClient: () =>
        ({
          async getCaptureEntry() {
            return {
              id: 'capture-1',
              content: 'Pay utilities',
              type: 'text',
              capturedAt: '2026-03-29T12:00:00.000Z',
              source: 'cli',
              tags: [],
              status: 'pending',
            };
          },
          async appendPlannedAction() {
            throw new Error('appendPlannedAction should not be called for invalid due input');
          },
          async updateCaptureEntry() {
            throw new Error('updateCaptureEntry should not be called for invalid due input');
          },
        }) as never,
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  const errorOutput = stderr.join('');
  assert.match(errorOutput, /ERR_INBOX_TRIAGE_FAILED:/);
  assert.match(errorOutput, /stage=append_planned_action/);
  assert.ok(!/stage=lookup/.test(errorOutput));
  assert.match(
    errorOutput,
    /fix=Retry with "--action task" and a valid optional "--due YYYY-MM-DD" date, or use "--action note\|defer"\./,
  );
});

test('capture command returns ERR_CAPTURE_FAILED on graph append failure', async () => {
  const stderr: string[] = [];
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-capture-fail-'));
  const graphPath = join(baseDir, 'life-graph.json');

  const exitCode = await runCli(['capture', 'test content', '--graph-path', graphPath], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: new Date().toISOString(),
            plans: [],
            captureEntries: [],
            calendarEvents: [],
            researchResults: [],
          };
        },
        async appendCaptureEntry() {
          throw new Error('Database write failed');
        },
      }) as never,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_CAPTURE_FAILED:/);
});

test('remind returns ERR_ACTION_NOT_FOUND when planned action does not exist', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['remind', 'missing-action', '--at', '2026-04-04T09:00:00Z'], {
    createLifeGraphClient: () =>
      ({
        async getPlannedAction() {
          return undefined;
        },
      }) as never,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_ACTION_NOT_FOUND:/);
});

test('remind with same --at returns existing reminder id and keeps a single scheduled reminder', async () => {
  const stdout: string[] = [];
  const actionId = 'action_1';
  const scheduledAt = '2026-04-04T09:00:00Z';
  const graph = {
    reminderEvents: [
      {
        id: 'reminder_old',
        actionId,
        scheduledFor: '2026-04-03T09:00:00Z',
        status: 'scheduled' as const,
      },
      {
        id: 'reminder_keep',
        actionId,
        scheduledFor: scheduledAt,
        status: 'scheduled' as const,
      },
    ],
  };

  const exitCode = await runCli(['remind', actionId, '--at', scheduledAt, '--json'], {
    createLifeGraphClient: () =>
      ({
        async getPlannedAction(id: string) {
          if (id !== actionId) {
            return undefined;
          }
          return {
            id: actionId,
            title: 'Schedule team sync',
            status: 'todo',
          };
        },
        async loadGraph() {
          return graph;
        },
        async appendReminderEvent(event: {
          id: string;
          actionId: string;
          scheduledFor: string;
          status: 'scheduled' | 'cancelled';
        }) {
          const index = graph.reminderEvents.findIndex((existing) => existing.id === event.id);
          if (index >= 0) {
            graph.reminderEvents[index] = event;
            return;
          }
          graph.reminderEvents.push(event);
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    id?: string;
    actionId?: string;
    scheduledFor?: string;
    status?: string;
  };
  assert.equal(payload.id, 'reminder_keep');
  assert.equal(payload.actionId, actionId);
  assert.equal(payload.scheduledFor, scheduledAt);
  assert.equal(payload.status, 'scheduled');

  const scheduled = graph.reminderEvents.filter(
    (event) => event.actionId === actionId && event.status === 'scheduled',
  );
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.id, 'reminder_keep');
});

test('remind with different --at cancels prior scheduled reminders and creates a new id', async () => {
  const stdout: string[] = [];
  const actionId = 'action_2';
  const nextScheduledAt = '2026-04-06T09:00:00Z';
  const graph = {
    reminderEvents: [
      {
        id: 'reminder_old_1',
        actionId,
        scheduledFor: '2026-04-04T09:00:00Z',
        status: 'scheduled' as const,
      },
      {
        id: 'reminder_old_2',
        actionId,
        scheduledFor: '2026-04-05T09:00:00Z',
        status: 'scheduled' as const,
      },
    ],
  };

  const exitCode = await runCli(['remind', actionId, '--at', nextScheduledAt, '--json'], {
    createLifeGraphClient: () =>
      ({
        async getPlannedAction(id: string) {
          if (id !== actionId) {
            return undefined;
          }
          return {
            id: actionId,
            title: 'Finalize monthly report',
            status: 'todo',
          };
        },
        async loadGraph() {
          return graph;
        },
        async appendReminderEvent(event: {
          id: string;
          actionId: string;
          scheduledFor: string;
          status: 'scheduled' | 'cancelled';
        }) {
          const index = graph.reminderEvents.findIndex((existing) => existing.id === event.id);
          if (index >= 0) {
            graph.reminderEvents[index] = event;
            return;
          }
          graph.reminderEvents.push(event);
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as {
    id?: string;
    actionId?: string;
    scheduledFor?: string;
    status?: string;
  };
  assert.equal(payload.actionId, actionId);
  assert.equal(payload.scheduledFor, nextScheduledAt);
  assert.equal(payload.status, 'scheduled');
  assert.ok(payload.id, 'Expected a reminder id in remind response');
  assert.notEqual(payload.id, 'reminder_old_1');
  assert.notEqual(payload.id, 'reminder_old_2');

  const scheduled = graph.reminderEvents.filter(
    (event) => event.actionId === actionId && event.status === 'scheduled',
  );
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.id, payload.id);
  assert.equal(scheduled[0]?.scheduledFor, nextScheduledAt);

  const reminderOld1 = graph.reminderEvents.find((event) => event.id === 'reminder_old_1');
  const reminderOld2 = graph.reminderEvents.find((event) => event.id === 'reminder_old_2');
  assert.equal(reminderOld1?.status, 'cancelled');
  assert.equal(reminderOld2?.status, 'cancelled');
});

test('remind publishes lifeos.reminder.scheduled with canonical payload', async () => {
  const actionId = 'action_3';
  const scheduledAt = '2026-04-07T09:00:00Z';
  const eventBus = createMockEventBus();
  const stderr: string[] = [];

  const exitCode = await runCli(['remind', actionId, '--at', scheduledAt, '--json', '--verbose'], {
    createLifeGraphClient: () =>
      ({
        async getPlannedAction(id: string) {
          if (id !== actionId) {
            return undefined;
          }
          return {
            id: actionId,
            title: 'Finalize ops review',
            status: 'todo',
          };
        },
        async loadGraph() {
          return {
            reminderEvents: [],
          };
        },
        async appendReminderEvent() {
          return;
        },
      }) as never,
    createEventBusClient: () => eventBus.bus,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const reminderEvent = eventBus.published.find(
    (event) => event.topic === Topics.lifeos.reminderScheduled,
  );
  assert.ok(reminderEvent);
  assert.equal(reminderEvent?.event.data.actionId, actionId);
  assert.equal(reminderEvent?.event.data.scheduledFor, scheduledAt);
  assert.equal(typeof reminderEvent?.event.data.id, 'string');
  assert.ok(stderr.join('').includes('event_published topic=lifeos.reminder.scheduled'));
});

test('tick fires due scheduled reminders once and publishes lifeos.reminder.fired', async () => {
  const stdout: string[] = [];
  const eventBus = createMockEventBus();
  const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const exitCode = await runCli(['tick', '--json', '--graph-path', '/tmp/life-graph.json'], {
    runTick: async () => ({
      now: '2026-04-07T09:00:00.000Z',
      checkedTasks: 0,
      overdueTasks: [],
    }),
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: '2026-04-07T08:00:00.000Z',
            plans: [],
            captureEntries: [],
            plannedActions: [],
            reminderEvents: [
              {
                id: 'reminder_due_1',
                actionId: 'action_1',
                scheduledFor: '2026-04-07T08:30:00.000Z',
                status: 'scheduled',
              },
              {
                id: 'reminder_future',
                actionId: 'action_2',
                scheduledFor: '2026-04-07T11:00:00.000Z',
                status: 'scheduled',
              },
              {
                id: 'reminder_fired',
                actionId: 'action_3',
                scheduledFor: '2026-04-07T07:00:00.000Z',
                status: 'fired',
              },
            ],
          };
        },
        async updateReminderEvent(id: string, patch: Record<string, unknown>) {
          updateCalls.push({ id, patch });
        },
      }) as never,
    createEventBusClient: () => eventBus.bus,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'reminder_due_1');
  assert.equal(updateCalls[0]?.patch.status, 'fired');
  const firedEvent = eventBus.published.find((event) => event.topic === Topics.lifeos.reminderFired);
  assert.ok(firedEvent);
  assert.equal(firedEvent?.event.data.reminderId, 'reminder_due_1');
  const payload = JSON.parse(stdout.join('')) as { overdueTasks: unknown[] };
  assert.equal(Array.isArray(payload.overdueTasks), true);
});

test('remind ack acknowledges fired reminder by id prefix', async () => {
  const stdout: string[] = [];
  const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const exitCode = await runCli(['remind', 'ack', 'reminder_fire', '--json'], {
    now: () => new Date('2026-04-07T10:00:00.000Z'),
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            reminderEvents: [
              {
                id: 'reminder_fire_1',
                actionId: 'action_1',
                scheduledFor: '2026-04-07T08:30:00.000Z',
                firedAt: '2026-04-07T08:30:00.000Z',
                status: 'fired',
              },
            ],
          };
        },
        async updateReminderEvent(id: string, patch: Record<string, unknown>) {
          updateCalls.push({ id, patch });
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]?.id, 'reminder_fire_1');
  assert.equal(updateCalls[0]?.patch.status, 'acknowledged');
  assert.equal(typeof updateCalls[0]?.patch.acknowledgedAt, 'string');
  const payload = JSON.parse(stdout.join('')) as { status?: string; id?: string };
  assert.equal(payload.id, 'reminder_fire_1');
  assert.equal(payload.status, 'acknowledged');
});

test('remind ack rejects non-fired reminders', async () => {
  const stderr: string[] = [];

  const exitCode = await runCli(['remind', 'ack', 'reminder_sched_1'], {
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            reminderEvents: [
              {
                id: 'reminder_sched_1',
                actionId: 'action_1',
                scheduledFor: '2026-04-07T11:00:00.000Z',
                status: 'scheduled',
              },
            ],
          };
        },
      }) as never,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_REMINDER_INVALID_STATE/);
});

// ─── demo:loop command tests ───────────────────────────────────────────────

function createLoopMockClient() {
  const captureEntries: Array<{
    id: string;
    content: string;
    type: string;
    capturedAt: string;
    source: string;
    tags: string[];
    status: string;
  }> = [];
  const plannedActions: Array<{
    id: string;
    title: string;
    status: string;
    sourceCapture?: string;
    dueDate?: string;
    completedAt?: string;
  }> = [];
  const reminderEvents: Array<{
    id: string;
    actionId: string;
    scheduledFor: string;
    status: string;
  }> = [];
  const calls: string[] = [];

  const client = {
    async appendCaptureEntry(entry: { id: string; content: string; [key: string]: unknown }) {
      calls.push('appendCaptureEntry');
      captureEntries.push(entry as (typeof captureEntries)[number]);
    },
    async updateCaptureEntry(id: string, patch: Record<string, unknown>) {
      calls.push('updateCaptureEntry');
      const entry = captureEntries.find((e) => e.id === id);
      if (entry) Object.assign(entry, patch);
    },
    async appendPlannedAction(action: { id: string; title: string; [key: string]: unknown }) {
      calls.push('appendPlannedAction');
      plannedActions.push(action as (typeof plannedActions)[number]);
    },
    async updatePlannedAction(id: string, patch: Record<string, unknown>) {
      calls.push('updatePlannedAction');
      const action = plannedActions.find((a) => a.id === id);
      if (action) Object.assign(action, patch);
    },
    async appendReminderEvent(event: { id: string; actionId: string; [key: string]: unknown }) {
      calls.push('appendReminderEvent');
      reminderEvents.push(event as (typeof reminderEvents)[number]);
    },
  };

  return { client, captureEntries, plannedActions, reminderEvents, calls };
}

test('demo:loop executes all five stages and reports completion', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const { client, captureEntries, plannedActions, reminderEvents } = createLoopMockClient();

  const exitCode = await runCli(['demo:loop', '--graph-path', '/tmp/test-graph.json'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-29T12:00:00.000Z'),
    createLifeGraphClient: () => client as never,
    generateReview: async () => sampleReviewInsights(),
    stdout: (message) => {
      stdout.push(message);
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.length, 0);

  const output = stdout.join('');
  assert.match(output, /Stage 1 — Capture/);
  assert.match(output, /Stage 2 — Triage/);
  assert.match(output, /Stage 3 — Remind/);
  assert.match(output, /Stage 4 — Complete/);
  assert.match(output, /Stage 5 — Review/);
  assert.match(output, /Demo loop complete/);

  assert.equal(captureEntries.length, 3);
  assert.equal(plannedActions.length, 3);
  assert.equal(reminderEvents.length, 1);
  // First action should be marked done
  assert.equal(plannedActions[0]?.status, 'done');
});

test('demo loop (space-separated) also routes to runDemoLoopCommand', async () => {
  const stdout: string[] = [];
  const { client } = createLoopMockClient();

  const exitCode = await runCli(['demo', 'loop', '--graph-path', '/tmp/test-graph.json'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-29T12:00:00.000Z'),
    createLifeGraphClient: () => client as never,
    generateReview: async () => sampleReviewInsights(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /Stage 1 — Capture/);
});

test('demo:loop --dry-run does not call any storage methods', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const { calls } = createLoopMockClient();

  // Client is provided but should never be called in dry-run mode
  const exitCode = await runCli(
    ['demo:loop', '--dry-run', '--graph-path', '/tmp/test-graph.json'],
    {
      env: {},
      cwd: () => '/repo',
      now: () => new Date('2026-03-29T12:00:00.000Z'),
      createLifeGraphClient: () => {
        calls.push('createLifeGraphClient');
        return {
          async loadGraph() {
            calls.push('loadGraph');
            throw new Error('loadGraph must not be called in dry-run');
          },
          async appendCaptureEntry() {
            calls.push('appendCaptureEntry');
            throw new Error('appendCaptureEntry must not be called in dry-run');
          },
        } as never;
      },
      generateReview: async () => {
        calls.push('generateReview');
        throw new Error('generateReview must not be called in dry-run');
      },
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(stderr.length, 0);

  const output = stdout.join('');
  assert.match(output, /Dry-run stage 1 ok/);
  assert.match(output, /Dry-run stage 2 ok/);
  assert.match(output, /Dry-run stage 3 ok/);
  assert.match(output, /Dry-run stage 4 ok/);
  assert.match(output, /Dry-run stage 5 ok/);

  // No storage or review methods should have been called
  assert.ok(
    !calls.includes('loadGraph'),
    `loadGraph was called but must not be in dry-run (calls: ${calls.join(', ')})`,
  );
  assert.ok(
    !calls.includes('appendCaptureEntry'),
    `appendCaptureEntry was called but must not be in dry-run`,
  );
  assert.ok(
    !calls.includes('generateReview'),
    `generateReview was called but must not be in dry-run`,
  );
});

test('demo:loop --json outputs structured trace with entries for all five stages', async () => {
  const stdout: string[] = [];
  const { client } = createLoopMockClient();

  const exitCode = await runCli(['demo:loop', '--json', '--graph-path', '/tmp/test-graph.json'], {
    env: {},
    cwd: () => '/repo',
    now: () => new Date('2026-03-29T12:00:00.000Z'),
    createLifeGraphClient: () => client as never,
    generateReview: async () => sampleReviewInsights(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const trace = JSON.parse(stdout.join('')) as Array<{ stage: string }>;
  assert.ok(Array.isArray(trace), 'Output should be a JSON array');

  const stages = trace.map((entry) => entry.stage);
  assert.ok(stages.includes('capture'), 'trace should include capture stage entries');
  assert.ok(stages.includes('triage'), 'trace should include triage stage entries');
  assert.ok(stages.includes('remind'), 'trace should include remind stage entry');
  assert.ok(stages.includes('complete'), 'trace should include complete stage entry');
  assert.ok(stages.includes('review'), 'trace should include review stage entry');

  const captureEntries = trace.filter((e) => e.stage === 'capture');
  assert.equal(captureEntries.length, 3, 'Expected 3 capture entries in trace');
  const triageEntries = trace.filter((e) => e.stage === 'triage');
  assert.equal(triageEntries.length, 3, 'Expected 3 triage entries in trace');
});

test('capture happy path returns JSON with id, status, content, and capturedAt', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-capture-happy-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const stdout: string[] = [];
  const fixedNow = new Date('2026-03-29T12:00:00.000Z');

  const exitCode = await runCli(
    ['capture', 'Plan team sync for Friday', '--json', '--graph-path', graphPath],
    {
      now: () => fixedNow,
      createLifeGraphClient: () =>
        ({
          async loadGraph() {
            return { version: '0.1.0', updatedAt: fixedNow.toISOString(), captureEntries: [] };
          },
          async appendCaptureEntry() {
            return;
          },
          async saveGraph() {
            return;
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  const payload = JSON.parse(output) as {
    id: string;
    status: string;
    content: string;
    capturedAt: string;
  };
  assert.ok(payload.id, 'Expected capture entry to have an id');
  assert.equal(payload.status, 'pending');
  assert.equal(payload.content, 'Plan team sync for Friday');
  assert.equal(payload.capturedAt, fixedNow.toISOString());
});

test('capture rejects invalid --type values with exit code 1', async () => {
  const stderr: string[] = [];
  let appendCalls = 0;

  const exitCode = await runCli(['capture', 'Plan team sync for Friday', '--type', 'voic'], {
    now: () => new Date('2026-03-29T12:00:00.000Z'),
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return { version: '0.1.0', updatedAt: '2026-03-29T12:00:00.000Z', captureEntries: [] };
        },
        async appendCaptureEntry() {
          appendCalls += 1;
          return;
        },
      }) as never,
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(appendCalls, 0);
  assert.match(
    stderr.join(''),
    /ERR_CAPTURE_INVALID_TYPE: Invalid capture type "voic"\. Allowed values: text\|voice\./,
  );
});

test('capture persists voice type when --type voice is provided', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-capture-voice-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const fixedNow = new Date('2026-03-29T12:00:00.000Z');
  let capturedType: string | undefined;

  const exitCode = await runCli(
    ['capture', 'Voice memo from standup', '--type', 'voice', '--graph-path', graphPath],
    {
      now: () => fixedNow,
      createLifeGraphClient: () =>
        ({
          async loadGraph() {
            return {
              version: '0.1.0',
              updatedAt: fixedNow.toISOString(),
              captureEntries: [],
            };
          },
          async appendCaptureEntry(entry: {
            id: string;
            content: string;
            capturedAt: string;
            type: string;
            source: string;
            status: string;
            tags: string[];
          }) {
            capturedType = entry.type;
            return;
          },
        }) as never,
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(capturedType, 'voice');
});

test('capture idempotency returns same id when called twice within 60 seconds', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-capture-idempotency-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const fixedNow = new Date('2026-03-29T12:00:00.000Z');
  let capturedEntryId = '';

  const client = {
    async loadGraph() {
      // First call returns empty, subsequent calls return the entry that was appended
      if (capturedEntryId.length === 0) {
        return {
          version: '0.1.0',
          updatedAt: fixedNow.toISOString(),
          captureEntries: [],
        };
      }
      return {
        version: '0.1.0',
        updatedAt: fixedNow.toISOString(),
        captureEntries: [
          {
            id: capturedEntryId,
            content: 'Plan team sync for Friday',
            type: 'text' as const,
            source: 'cli' as const,
            status: 'pending' as const,
            tags: [] as string[],
            capturedAt: fixedNow.toISOString(),
          },
        ],
      };
    },
    async appendCaptureEntry(entry: {
      id: string;
      content: string;
      capturedAt: string;
      type: string;
      source: string;
      status: string;
      tags: string[];
    }) {
      capturedEntryId = entry.id;
      return;
    },
    async saveGraph() {
      return;
    },
  };

  const firstStdout: string[] = [];
  const firstExitCode = await runCli(
    ['capture', 'Plan team sync for Friday', '--json', '--graph-path', graphPath],
    {
      now: () => fixedNow,
      createLifeGraphClient: () => client as never,
      stdout: (message) => {
        firstStdout.push(message);
      },
    },
  );
  assert.equal(firstExitCode, 0);
  const firstPayload = JSON.parse(firstStdout.join('')) as { id: string };
  const firstId = firstPayload.id;

  const secondStdout: string[] = [];
  const secondExitCode = await runCli(
    ['capture', 'Plan team sync for Friday', '--json', '--graph-path', graphPath],
    {
      now: () => new Date(fixedNow.getTime() + 30000), // 30 seconds later
      createLifeGraphClient: () => client as never,
      stdout: (message) => {
        secondStdout.push(message);
      },
    },
  );
  assert.equal(secondExitCode, 0);
  const secondPayload = JSON.parse(secondStdout.join('')) as { id: string };
  const secondId = secondPayload.id;

  assert.equal(secondId, firstId, 'Expected same id for idempotent capture within 60 seconds');
});

test('capture failure when appendCaptureEntry throws returns exit code 1 with ERR_CAPTURE_FAILED', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fixedNow = new Date('2026-03-29T12:00:00.000Z');

  const exitCode = await runCli(
    ['capture', 'fail me', '--json', '--graph-path', '/tmp/test-graph.json'],
    {
      now: () => fixedNow,
      createLifeGraphClient: () =>
        ({
          async loadGraph() {
            return {
              version: '0.1.0',
              updatedAt: fixedNow.toISOString(),
              captureEntries: [],
            };
          },
          async appendCaptureEntry() {
            throw new Error('disk full');
          },
        }) as never,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_CAPTURE_FAILED/);
});

test('capture human-mode output prints Captured message with content', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'lifeos-cli-capture-human-'));
  const graphPath = join(baseDir, 'life-graph.json');
  const stdout: string[] = [];
  const fixedNow = new Date('2026-03-29T12:00:00.000Z');

  const exitCode = await runCli(['capture', 'Buy groceries', '--graph-path', graphPath], {
    now: () => fixedNow,
    createLifeGraphClient: () =>
      ({
        async loadGraph() {
          return {
            version: '0.1.0',
            updatedAt: fixedNow.toISOString(),
            captureEntries: [],
          };
        },
        async appendCaptureEntry() {
          return;
        },
        async saveGraph() {
          return;
        },
      }) as never,
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /Captured:/i);
  assert.match(output, /Buy groceries/);
  // Verify it's human-mode, not JSON
  assert.doesNotThrow(() => {
    // If it were JSON, this would be valid JSON. We check that it's NOT
    try {
      JSON.parse(output);
      // If we get here, it's JSON which is wrong
      throw new Error('Output should not be valid JSON in human mode');
    } catch (e: unknown) {
      if ((e as Error).message === 'Output should not be valid JSON in human mode') {
        throw e;
      }
      // Expected: parse error means it's human-mode
      return;
    }
  });
});

// ─── tick --watch tests ────────────────────────────────────────────────────

test('tick --watch --every 10s exits 1 with ERR_INVALID_TICK_INTERVAL (below minimum)', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(['tick', '--watch', '--every', '10s'], {
    stdout: (message) => { stdout.push(message); },
    stderr: (message) => { stderr.push(message); },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_INVALID_TICK_INTERVAL/);
});

test('tick --watch --every 1.5m exits 1 with ERR_INVALID_TICK_INTERVAL (decimal)', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(['tick', '--watch', '--every', '1.5m'], {
    stdout: (message) => { stdout.push(message); },
    stderr: (message) => { stderr.push(message); },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_INVALID_TICK_INTERVAL/);
});

test('tick --watch --every 15 (no unit) exits 1 with ERR_INVALID_TICK_INTERVAL', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(['tick', '--watch', '--every', '15'], {
    stdout: (message) => { stdout.push(message); },
    stderr: (message) => { stderr.push(message); },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_INVALID_TICK_INTERVAL/);
});

test('tick --watch --every 5d (unsupported unit) exits 1 with ERR_INVALID_TICK_INTERVAL', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runCli(['tick', '--watch', '--every', '5d'], {
    stdout: (message) => { stdout.push(message); },
    stderr: (message) => { stderr.push(message); },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /ERR_INVALID_TICK_INTERVAL/);
});

test('tick --watch: second tick starts only after first completes and sleep elapses', async () => {
  // Record event ordering to prove tick1 → sleep1 → tick2 before stopping on sleep2
  const events: string[] = [];
  let tickCount = 0;
  let sleepCount = 0;

  const fakeTick = async (): Promise<{ now: string; checkedTasks: number; overdueTasks: [] }> => {
    tickCount += 1;
    events.push(`tick:${tickCount}:start`);
    await Promise.resolve(); // yield to verify async ordering holds
    events.push(`tick:${tickCount}:end`);
    return { now: new Date().toISOString(), checkedTasks: 0, overdueTasks: [] };
  };

  const fakeSleep = (_ms: number): Promise<void> => {
    sleepCount += 1;
    events.push(`sleep:${sleepCount}:start`);
    if (sleepCount >= 2) {
      // Emit SIGTERM during the second sleep to stop the watcher
      process.emit('SIGTERM');
      // Return a never-resolving promise; the stop-promise race will win
      return new Promise(() => {});
    }
    events.push(`sleep:${sleepCount}:end`);
    return Promise.resolve();
  };

  const stdout: string[] = [];

  const exitCode = await runCli(['tick', '--watch', '--every', '1m'], {
    runTick: fakeTick,
    createLifeGraphClient: () =>
      ({
        async loadGraph() { return { reminderEvents: [] }; },
        async updateReminderEvent() { return; },
        async appendReminderEvent() { return; },
      }) as never,
    sleep: fakeSleep,
    stdout: (message) => { stdout.push(message); },
    stderr: () => {},
  });

  assert.equal(exitCode, 0);
  // Two full ticks completed
  assert.equal(tickCount, 2);
  // Verify strict ordering: tick1 ends before sleep1 starts, sleep1 ends before tick2 starts
  const tick1End = events.indexOf('tick:1:end');
  const sleep1Start = events.indexOf('sleep:1:start');
  const sleep1End = events.indexOf('sleep:1:end');
  const tick2Start = events.indexOf('tick:2:start');
  assert.ok(tick1End < sleep1Start, 'tick 1 must complete before sleep 1 starts');
  assert.ok(sleep1Start < sleep1End, 'sleep 1 start must precede sleep 1 end');
  assert.ok(sleep1End < tick2Start, 'sleep 1 must elapse before tick 2 starts');
  assert.match(stdout.join(''), /stopped/i);
});

test('tick --watch: SIGTERM causes clean exit with code 0', async () => {
  // fakeSleep emits SIGTERM while the interval wait is pending.
  // The interruptible race (Promise.race([sleep, stopPromise])) must resolve immediately.
  const stdout: string[] = [];
  let tickCount = 0;

  const fakeSleep = (_ms: number): Promise<void> => {
    // Emit SIGTERM synchronously — the registered SIGTERM handler runs immediately,
    // resolving stopPromise, which wins the race against this never-resolving promise.
    process.emit('SIGTERM');
    return new Promise(() => {}); // never resolves on its own
  };

  const exitCode = await runCli(['tick', '--watch', '--every', '1m'], {
    runTick: async () => {
      tickCount += 1;
      return { now: new Date().toISOString(), checkedTasks: 0, overdueTasks: [] };
    },
    createLifeGraphClient: () =>
      ({
        async loadGraph() { return { reminderEvents: [] }; },
        async updateReminderEvent() { return; },
        async appendReminderEvent() { return; },
      }) as never,
    sleep: fakeSleep,
    stdout: (message) => { stdout.push(message); },
    stderr: () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(tickCount, 1); // only one tick before signal
  assert.match(stdout.join(''), /stopped/i);
});

test('lifeos remind <id> --at <iso> output contains tick dependency note', async () => {
  const actionId = 'action_remind_note';
  const scheduledAt = '2026-05-01T09:00:00Z';
  const stdout: string[] = [];

  const exitCode = await runCli(['remind', actionId, '--at', scheduledAt], {
    createLifeGraphClient: () =>
      ({
        async getPlannedAction(id: string) {
          if (id !== actionId) return undefined;
          return { id: actionId, title: 'Test action', status: 'todo' };
        },
        async loadGraph() { return { reminderEvents: [] }; },
        async appendReminderEvent() { return; },
      }) as never,
    stdout: (message) => { stdout.push(message); },
    stderr: () => {},
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.join(''), /It will fire when lifeos tick runs/);
});
