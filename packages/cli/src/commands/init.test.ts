import { strict as assert } from 'node:assert';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { MissingMicrophoneConsentError } from '@lifeos/voice-core';

import { runInitCommand } from './init';

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

test('init retries Ollama detection, saves config, enables modules, and runs first goal', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'lifeos-init-'));
  const graphPath = join(workspaceRoot, 'life-graph.json');
  const stdout: string[] = [];
  const stderr: string[] = [];
  const moduleCalls: Array<{ moduleId: string; enabled: boolean }> = [];
  const goalCalls: Array<{ goal: string; model: string; graphPath: string }> = [];
  const spinnerRecorder = createSpinnerRecorder();
  let fetchCount = 0;

  const exitCode = await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: workspaceRoot,
        LIFEOS_GRAPH_PATH: graphPath,
      },
      cwd: () => workspaceRoot,
      fileExists: () => false,
      now: () => new Date('2026-03-24T10:00:00.000Z'),
      fetchFn: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              models: [{ name: 'llama3.1:8b' }, { name: 'qwen3:8b' }],
            };
          },
        } as Response;
      },
      confirmPrompt: async ({ message }) => {
        if (message.includes('Press Enter once Ollama is running')) {
          return true;
        }
        if (message.includes('enable voice now')) {
          return false;
        }
        return true;
      },
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => ['research', 'news'],
      inputPrompt: async () => 'Prepare for the quarterly board meeting',
      setOptionalModuleEnabled: async (moduleId, enabled) => {
        moduleCalls.push({ moduleId, enabled });
      },
      runGoalCommand: async (goal, options) => {
        goalCalls.push({ goal, model: options.model, graphPath: options.graphPath });
        return 0;
      },
      createSpinner: () => spinnerRecorder.spinner,
      stdout: (message) => {
        stdout.push(message);
      },
      stderr: (message) => {
        stderr.push(message);
      },
      platform: 'linux',
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(fetchCount, 2);
  assert.deepEqual(goalCalls, [
    {
      goal: 'Prepare for the quarterly board meeting',
      model: 'llama3.1:8b',
      graphPath,
    },
  ]);
  assert.deepEqual(moduleCalls, [
    { moduleId: 'research', enabled: true },
    { moduleId: 'weather', enabled: false },
    { moduleId: 'news', enabled: true },
    { moduleId: 'email-summarizer', enabled: false },
    { moduleId: 'habit-streak', enabled: false },
    { moduleId: 'health', enabled: false },
    { moduleId: 'google-bridge', enabled: false },
  ]);
  assert.match(stdout.join(''), /Welcome to LifeOS/);
  assert.match(stdout.join(''), /LifeOS is ready\./);
  assert.match(stdout.join(''), /Voice requires a supported local microphone setup/);
  assert.match(stderr.join(''), /LifeOS could not reach Ollama/);
  assert.deepEqual(spinnerRecorder.calls, ['start', 'succeed', 'stop']);
});

test('init pulls the default model when Ollama has no tags', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'lifeos-init-pull-'));
  const graphPath = join(workspaceRoot, 'life-graph.json');
  const spawnCalls: Array<{ command: string; args: string[] }> = [];
  let fetchCount = 0;

  const exitCode = await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: workspaceRoot,
        LIFEOS_GRAPH_PATH: graphPath,
      },
      cwd: () => workspaceRoot,
      fileExists: () => false,
      fetchFn: async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return fetchCount === 1 ? { models: [] } : { models: [{ name: 'llama3.1:8b' }] };
          },
        } as Response;
      },
      confirmPrompt: async () => true,
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Plan my week',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      createSpinner: () => createSpinnerRecorder().spinner,
      spawnProcess: (command, args) => {
        spawnCalls.push({ command, args });
        return {
          stdout: null,
          stderr: null,
          on(event, listener) {
            if (event === 'close') {
              queueMicrotask(() => (listener as (value: number | null) => void)(0));
            }
            return this;
          },
        };
      },
      platform: 'linux',
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(spawnCalls, [{ command: 'ollama', args: ['pull', 'llama3.1:8b'] }]);
});

test('init continues when voice consent flow degrades', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'lifeos-init-voice-'));
  const graphPath = join(workspaceRoot, 'life-graph.json');
  const stderr: string[] = [];

  const exitCode = await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: workspaceRoot,
        LIFEOS_GRAPH_PATH: graphPath,
      },
      cwd: () => workspaceRoot,
      fileExists: () => false,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [{ name: 'llama3.1:8b' }] };
          },
        }) as Response,
      confirmPrompt: async ({ message }) => !message.includes('Re-run setup'),
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Plan my week',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      grantVoiceConsent: async () => {
        throw new MissingMicrophoneConsentError('Mic consent was not granted.');
      },
      stderr: (message) => {
        stderr.push(message);
      },
      platform: 'win32',
    },
  );

  assert.equal(exitCode, 0);
  assert.match(stderr.join(''), /Mic consent was not granted/);
});

test('init exits early when an existing graph is detected and the user declines re-init', async () => {
  const stdout: string[] = [];
  let goalInvoked = false;

  const exitCode = await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        LIFEOS_GRAPH_PATH: '/repo/life-graph.json',
      },
      cwd: () => '/repo',
      fileExists: () => true,
      getGraphSummary: async () => ({
        version: '0.1.0',
        updatedAt: '2026-03-24T10:00:00.000Z',
        totalPlans: 2,
        totalGoals: 2,
        latestPlanCreatedAt: '2026-03-24T10:00:00.000Z',
        latestGoalCreatedAt: '2026-03-24T10:00:00.000Z',
        recentPlanTitles: ['Board Meeting Prep'],
        recentGoalTitles: ['Board Meeting Prep'],
        activeGoals: [],
      }),
      confirmPrompt: async () => false,
      runGoalCommand: async () => {
        goalInvoked = true;
        return 0;
      },
      stdout: (message) => {
        stdout.push(message);
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(goalInvoked, false);
  assert.match(stdout.join(''), /already have a life graph with 2 goals/);
});

test('force skips the re-init guard', async () => {
  let confirmMessages = 0;

  const exitCode = await runInitCommand(
    {
      force: true,
      verbose: false,
    },
    {
      env: {
        LIFEOS_GRAPH_PATH: '/repo/life-graph.json',
      },
      cwd: () => '/repo',
      fileExists: () => true,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [{ name: 'llama3.1:8b' }] };
          },
        }) as Response,
      confirmPrompt: async () => {
        confirmMessages += 1;
        return false;
      },
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Plan my week',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      platform: 'linux',
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(confirmMessages, 0);
});

test('voice support detection returns true for macOS', async () => {
  let voiceTestInvoked = false;

  await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: '/test-home',
      },
      cwd: () => '/test-home',
      fileExists: () => false,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [{ name: 'llama3.1:8b' }] };
          },
        }) as Response,
      confirmPrompt: async ({ message }) => {
        if (message.includes('enable voice now')) {
          return true;
        }
        return true;
      },
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Test goal',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      createVoiceCore: () => ({
        start: async () => undefined,
        runDemo: async () => {
          voiceTestInvoked = true;
          return null;
        },
        close: async () => undefined,
        getWakePhrase: () => 'test',
      }),
      grantVoiceConsent: async () => undefined,
      platform: 'darwin',
    },
  );

  assert.equal(voiceTestInvoked, true, 'macOS should enable voice test');
});

test('voice support detection checks for arecord on Linux and proceeds when present', async () => {
  let voiceTestInvoked = false;

  await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: '/test-home',
      },
      cwd: () => '/test-home',
      fileExists: () => false,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [{ name: 'llama3.1:8b' }] };
          },
        }) as Response,
      confirmPrompt: async ({ message }) => {
        if (message.includes('enable voice now')) {
          return true;
        }
        return true;
      },
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Test goal',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      createVoiceCore: () => ({
        start: async () => undefined,
        runDemo: async () => {
          voiceTestInvoked = true;
          return null;
        },
        close: async () => undefined,
        getWakePhrase: () => 'test',
      }),
      grantVoiceConsent: async () => undefined,
      platform: 'linux',
      checkLinuxMicrophoneTools: async () => true,
    },
  );

  assert.equal(voiceTestInvoked, true, 'Linux with arecord should enable voice test');
});

test('voice support detection skips voice on Linux when arecord is missing', async () => {
  const stdout: string[] = [];

  await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: '/test-home',
      },
      cwd: () => '/test-home',
      fileExists: () => false,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [{ name: 'llama3.1:8b' }] };
          },
        }) as Response,
      confirmPrompt: async () => true,
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Test goal',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      stdout: (message) => {
        stdout.push(message);
      },
      platform: 'linux',
      checkLinuxMicrophoneTools: async () => false,
    },
  );

  assert.match(
    stdout.join(''),
    /Voice requires a supported local microphone setup/,
    'Linux without arecord should skip voice',
  );
});

test('model pull timeout terminates the child process', async () => {
  const killCalls: Array<{ signal?: NodeJS.Signals | number }> = [];

  await runInitCommand(
    {
      force: false,
      verbose: false,
    },
    {
      env: {
        HOME: '/test-home',
      },
      cwd: () => '/test-home',
      fileExists: () => false,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return { models: [] };
          },
        }) as Response,
      confirmPrompt: async ({ message }) => {
        if (message.includes('No models found')) {
          return true;
        }
        if (message.includes('already have a life graph')) {
          return false;
        }
        return true;
      },
      selectPrompt: async () => 'llama3.1:8b',
      checkboxPrompt: async () => [],
      inputPrompt: async () => 'Test goal',
      setOptionalModuleEnabled: async () => undefined,
      runGoalCommand: async () => 0,
      createSpinner: () => createSpinnerRecorder().spinner,
      spawnProcess: (command) => {
        if (command !== 'ollama') {
          throw new Error(`Unexpected command: ${command}`);
        }
        return {
          stdout: null,
          stderr: null,
          on() {
            return this;
          },
          kill: (signal?: NodeJS.Signals | number) => {
            if (signal === undefined) {
              killCalls.push({});
            } else {
              killCalls.push({ signal });
            }
            return true;
          },
        };
      },
      modelPullTimeoutMs: 1,
      platform: 'linux',
      checkLinuxMicrophoneTools: async () => false,
    },
  );

  assert.ok(killCalls.length > 0, 'process.kill() should be called when model pull times out');
  const firstKill = killCalls[0];
  assert.ok(firstKill, 'expected a kill call record');
  assert.deepEqual(firstKill.signal, 'SIGTERM', 'timeout should send SIGTERM to child process');
});
