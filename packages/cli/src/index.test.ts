import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type BaseEvent, type ManagedEventBus } from '@lifeos/event-bus';
import type {
  GoalPlan,
  LifeGraphDocument,
  LifeGraphReviewInsights,
  LifeGraphSummary,
} from '@lifeos/life-graph';

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

test('voice start requires explicit mic-on flag', async () => {
  const stderr: string[] = [];
  let factoryCalls = 0;

  const exitCode = await runCli(['voice', 'start'], {
    createVoiceCore: () => {
      factoryCalls += 1;
      return {
        async start() {
          return;
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
      };
    },
    stderr: (message) => {
      stderr.push(message);
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(factoryCalls, 0);
  assert.match(stderr.join(''), /Re-run with --mic-on/);
});

test('voice start shows active message and waits for signal when mic-on is set', async () => {
  const stdout: string[] = [];
  let started = 0;
  let closed = 0;

  const exitCode = await runCli(['voice', 'start', '--mic-on'], {
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
