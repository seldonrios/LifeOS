import assert from 'node:assert/strict';
import test from 'node:test';

import type { ModuleRuntimeContext } from '@lifeos/module-loader';

import { summarizeForBusyUser } from './summary';

function createContext(env: NodeJS.ProcessEnv): ModuleRuntimeContext {
  return {
    env,
    eventBus: {} as ModuleRuntimeContext['eventBus'],
    createLifeGraphClient: () => {
      throw new Error('createLifeGraphClient should not be called');
    },
    subscribe: async () => {},
    publish: async <T extends Record<string, unknown>>(topic: string, data: T, source?: string) =>
      ({
        id: 'evt_1',
        type: topic,
        timestamp: new Date().toISOString(),
        source: source ?? 'test',
        version: '0.1.0',
        data,
      }) as {
        id: string;
        type: string;
        timestamp: string;
        source: string;
        version: string;
        data: T;
      },
    log: () => {},
  };
}

test('summarizeForBusyUser falls back to source text when disabled', async () => {
  const context = createContext({
    ...process.env,
    LIFEOS_GOOGLE_BRIDGE_LLM_SUMMARY: '0',
  });
  const result = await summarizeForBusyUser(context, 'Raw snippet text.');
  assert.equal(result, 'Raw snippet text.');
});

test('summarizeForBusyUser uses ollama response when available', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    new Response(
      JSON.stringify({
        message: {
          content: 'Short summary from llm.',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  try {
    const context = createContext({
      ...process.env,
      LIFEOS_GOOGLE_BRIDGE_LLM_SUMMARY: '1',
      OLLAMA_HOST: 'http://localhost:11434',
    });
    const result = await summarizeForBusyUser(context, 'Long email body text for summary');
    assert.equal(result, 'Short summary from llm.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
