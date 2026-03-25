import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeMessages } from './summarizer';
import type { RawMessage } from './events';

const baseMessage: RawMessage = {
  subject: 'Hello\u0000   world',
  from: 'Alice\n<alice@example.com>',
  messageId: '<msg-1@example.com>',
  receivedAt: '2026-03-25T08:00:00.000Z',
  body: 'Line 1\n\nLine 2 with\u0000control chars',
  accountLabel: 'work',
};

test('summarizer falls back to default endpoint for unsupported protocol', async () => {
  let capturedUrl = '';

  const results = await summarizeMessages(
    [baseMessage],
    {
      OLLAMA_HOST: 'ftp://127.0.0.1:11434',
      LIFEOS_EMAIL_MODEL: 'llama3.1:8b',
    },
    (async (input: string | URL) => {
      capturedUrl = String(input);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: '[{"messageId":"<msg-1@example.com>","summary":"ok"}]',
            },
          };
        },
      } as Response;
    }) as typeof fetch,
  );

  assert.equal(capturedUrl, 'http://127.0.0.1:11434/api/chat');
  assert.equal(results.length, 1);
  assert.equal(results[0]?.summary, 'ok');
});

test('summarizer normalizes configured endpoint and preserves nested base path', async () => {
  let capturedUrl = '';

  await summarizeMessages(
    [baseMessage],
    {
      OLLAMA_HOST: 'https://example.local:11434/ollama///',
      LIFEOS_EMAIL_MODEL: 'llama3.1:8b',
    },
    (async (input: string | URL) => {
      capturedUrl = String(input);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: '[{"messageId":"<msg-1@example.com>","summary":"ok"}]',
            },
          };
        },
      } as Response;
    }) as typeof fetch,
  );

  assert.equal(capturedUrl, 'https://example.local:11434/ollama/api/chat');
});

test('summarizer sanitizes and bounds model before request', async () => {
  let capturedModel = '';

  await summarizeMessages(
    [baseMessage],
    {
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      LIFEOS_EMAIL_MODEL: `  model\u0000name\n${'x'.repeat(300)}  `,
    },
    (async (_input: string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { model?: string };
      capturedModel = payload.model ?? '';
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: '[{"messageId":"<msg-1@example.com>","summary":"ok"}]',
            },
          };
        },
      } as Response;
    }) as typeof fetch,
  );

  assert.equal(capturedModel.includes('\n'), false);
  assert.equal(capturedModel.includes('\u0000'), false);
  assert.ok(capturedModel.startsWith('model name'));
  assert.ok(capturedModel.length <= 120);
});

test('summarizer sanitizes and caps model-provided summary length', async () => {
  const unsafeSummary = `  keep\u0000 this\ncompact ${'A'.repeat(600)}  `;

  const results = await summarizeMessages(
    [baseMessage],
    {
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      LIFEOS_EMAIL_MODEL: 'llama3.1:8b',
    },
    (async () => {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            message: {
              content: JSON.stringify([
                {
                  messageId: '<msg-1@example.com>',
                  summary: unsafeSummary,
                },
              ]),
            },
          };
        },
      } as Response;
    }) as typeof fetch,
  );

  const summary = results[0]?.summary ?? '';
  assert.equal(summary.includes('\n'), false);
  assert.equal(summary.includes('\u0000'), false);
  assert.ok(summary.startsWith('keep this compact'));
  assert.ok(summary.length <= 400);
});

test('summarizer fallback path sanitizes preview when request fails', async () => {
  const results = await summarizeMessages(
    [
      {
        ...baseMessage,
        body: `  first\nline\u0000 second line ${'B'.repeat(200)}  `,
      },
    ],
    {
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      LIFEOS_EMAIL_MODEL: 'llama3.1:8b',
    },
    (async () => {
      throw new Error('network down');
    }) as typeof fetch,
  );

  const summary = results[0]?.summary ?? '';
  assert.equal(summary.includes('\n'), false);
  assert.equal(summary.includes('\u0000'), false);
  assert.ok(summary.startsWith('first line second line'));
  assert.ok(summary.length <= 120);
});
