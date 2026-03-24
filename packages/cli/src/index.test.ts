import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import type {
  GoalPlan,
  LifeGraphDocument,
  LifeGraphReviewInsights,
  LifeGraphSummary,
} from '@lifeos/life-graph';
import { MissingMicrophoneConsentError } from '@lifeos/voice-core';

import { runCli } from './index';

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
  assert.match(stdout.join(''), /Welcome to LifeOS! Initializing your personal graph/);
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

  const exitCode = await runCli(['status'], {
    getGraphSummary: async () => sampleSummary(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /LifeOS Status/);
  assert.match(output, /Board Meeting Prep/);
  assert.match(output, /2 total goals/);
});

test('status --json emits summary JSON', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['status', '--json'], {
    getGraphSummary: async () => sampleSummary(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphSummary;
  assert.equal(parsed.version, '0.1.0');
  assert.equal(parsed.totalGoals, 2);
  assert.equal(parsed.activeGoals[0]?.title, 'Board Meeting Prep');
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
  const rows = JSON.parse(stdout.join('')) as Array<{ id: string; goalTitle: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.goalTitle, 'Board Meeting Prep');
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
          goalTitle: 'Board Prep',
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
          goalTitle: 'Board Prep',
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
  };
  assert.equal(manifest.name, 'my-awesome-module');
  assert.equal(manifest.author, 'octocat');
  assert.equal(manifest.resources.cpu, 'low');
  assert.equal(manifest.resources.memory, 'low');
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
      requires: ['@lifeos/voice-core'],
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

test('module enable rejects optional modules without local runtime implementation', async () => {
  const baseHome = await mkdtemp(join(tmpdir(), 'lifeos-cli-module-enable-missing-'));
  const stderr: string[] = [];

  const exitCode = await runCli(['module', 'enable', 'health'], {
    env: { HOME: baseHome },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(''), /no local runtime implementation/i);
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

test('marketplace search returns matching entries', async () => {
  const stdout: string[] = [];
  const exitCode = await runCli(['marketplace', 'search', 'research', '--json'], {
    stdout: (message) => {
      stdout.push(message);
    },
  });
  assert.equal(exitCode, 0);
  const payload = JSON.parse(stdout.join('')) as Array<{ id: string }>;
  assert.ok(payload.some((entry) => entry.id === 'research'));
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
    nodes: Array<{ nodeId: string }>;
    assignments: Record<string, string>;
  };
  assert.ok(payload.nodes.some((node) => node.nodeId === 'heavy-server'));
  assert.equal(payload.assignments.research, 'heavy-server');
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
