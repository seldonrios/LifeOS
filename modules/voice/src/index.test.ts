import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics, type ModuleRuntimeContext } from '@lifeos/module-sdk';

import { voiceModule } from './index';

function createVoiceContextMock(env: NodeJS.ProcessEnv = {}) {
  const handlers = new Map<string, (event: { data: Record<string, unknown> }) => Promise<void>>();
  const logs: string[] = [];

  const context = {
    env,
    log(message: string) {
      logs.push(message);
    },
    async subscribe<T extends Record<string, unknown>>(
      topic: string,
      handler: (event: { data: T }) => Promise<void>,
    ) {
      handlers.set(topic, handler as (event: { data: Record<string, unknown> }) => Promise<void>);
    },
    async publish() {},
  } as unknown as ModuleRuntimeContext;

  return { context, handlers, logs };
}

test('voiceModule defaults retainAudio to false when env is unset', async () => {
  const { context, logs } = createVoiceContextMock();

  await voiceModule.init(context);

  assert.equal(logs.some((entry) => entry.includes('retainAudio=false')), true);
});

test('voiceModule handles voice session start and completion events', async () => {
  const { context, handlers, logs } = createVoiceContextMock();

  await voiceModule.init(context);

  const startedHandler = handlers.get(Topics.lifeos.homeNodeVoiceSessionStarted);
  const completedHandler = handlers.get(Topics.lifeos.homeNodeVoiceSessionCompleted);

  assert.ok(startedHandler);
  assert.ok(completedHandler);

  await assert.doesNotReject(async () => {
    await startedHandler({
      data: {
        sessionId: 'session-1',
      },
    });
  });

  await assert.doesNotReject(async () => {
    await completedHandler({
      data: {
        sessionId: 'session-1',
      },
    });
  });

  assert.equal(logs.some((entry) => entry.includes('session started')), true);
  assert.equal(logs.some((entry) => entry.includes('session completed')), true);
});