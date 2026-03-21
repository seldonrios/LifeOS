import assert from 'node:assert/strict';
import test from 'node:test';

import { GoalPlanParseError, type GoalInterpretationPlan } from '@lifeos/goal-engine';
import type { LifeGraphDocument } from '@lifeos/life-graph';

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
        tasks: [],
        createdAt: '2026-03-21T14:00:00.000Z',
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
  const parsed = JSON.parse(output) as GoalInterpretationPlan;
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
      throw new GoalPlanParseError('validation failed', '{"foo":"bar"}');
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
    getGraphSummary: async () => ({
      version: '0.1.0',
      totalPlans: 2,
      totalGoals: 2,
      updatedAt: '2026-03-21T14:00:00.000Z',
      latestPlanCreatedAt: '2026-03-21T14:00:00.000Z',
      latestGoalCreatedAt: '2026-03-21T14:00:00.000Z',
      recentPlanTitles: ['Board Meeting Prep', 'Quarterly Review'],
      recentGoalTitles: ['Board Meeting Prep', 'Quarterly Review'],
    }),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const output = stdout.join('');
  assert.match(output, /Life Graph Status/);
  assert.match(output, /Total Plans: 2/);
  assert.match(output, /Recent Titles: Board Meeting Prep \| Quarterly Review/);
});

test('status --json emits full versioned graph document', async () => {
  const stdout: string[] = [];

  const exitCode = await runCli(['status', '--json'], {
    loadGraph: async () => sampleGraph(),
    stdout: (message) => {
      stdout.push(message);
    },
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.join('')) as LifeGraphDocument;
  assert.equal(parsed.version, '0.1.0');
  assert.equal(parsed.plans.length, 1);
  assert.equal(parsed.plans[0]?.title, 'Board Meeting Prep');
});
