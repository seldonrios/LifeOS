import assert from 'node:assert/strict';
import test from 'node:test';

import { WhisperSttAdapter, WhisperUnavailableError } from './whisper-adapter';

test('WhisperSttAdapter posts WAV payloads to the configured endpoint', async () => {
  let requestUrl = '';
  let requestBody = '';
  const adapter = new WhisperSttAdapter({
    endpoint: 'http://127.0.0.1:9000/whisper',
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ text: 'add oat milk' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const transcript = await adapter.transcribe(Buffer.from([0x00, 0x00, 0xff, 0x7f]));

  assert.equal(transcript, 'add oat milk');
  assert.equal(requestUrl, 'http://127.0.0.1:9000/whisper');
  const payload = JSON.parse(requestBody) as { audioBase64?: string; mimeType?: string };
  assert.equal(payload.mimeType, 'audio/wav');
  assert.equal(typeof payload.audioBase64, 'string');
});

test('WhisperSttAdapter reports degraded health on probe failure', async () => {
  const adapter = new WhisperSttAdapter({
    endpoint: 'http://127.0.0.1:9000/whisper',
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
  });

  const snapshot = await adapter.checkHealth();

  assert.equal(snapshot.status, 'degraded');
  assert.match(snapshot.reason ?? '', /connection refused/);
});

test('WhisperSttAdapter throws WhisperUnavailableError when no endpoint is configured', async () => {
  const adapter = new WhisperSttAdapter({ endpoint: '' });

  await assert.rejects(() => adapter.transcribe(Buffer.from([0x00, 0x00])), WhisperUnavailableError);
});