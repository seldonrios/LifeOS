import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics } from '@lifeos/event-bus';

import { VoiceCore } from './index';

function createSpeechToTextMock() {
  let handler: ((event: { text: string; confidence: number }) => Promise<void>) | null = null;

  return {
    stt: {
      async start(next: (event: { text: string; confidence: number }) => Promise<void>) {
        handler = next;
      },
      async stop() {
        handler = null;
      },
    } as never,
    async emit(text: string, confidence = 0.9) {
      await handler?.({ text, confidence });
    },
  };
}

test('wake-only phrase arms the session and the next utterance becomes a command', async () => {
  const transcripts = createSpeechToTextMock();
  const spoken: string[] = [];
  const published: string[] = [];
  const handled: string[] = [];
  let currentTime = Date.parse('2026-03-22T15:00:00.000Z');

  const core = new VoiceCore({
    speechToText: transcripts.stt,
    textToSpeech: {
      async speak(text: string) {
        spoken.push(text);
      },
    } as never,
    router: {
      async handleCommand(text: string) {
        handled.push(text);
        return {
          handled: true,
          action: 'task_added',
          responseText: 'Added a task to buy milk.',
        };
      },
    } as never,
    publish: async (topic) => {
      published.push(topic);
    },
    now: () => new Date(currentTime),
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');
  currentTime += 1_000;
  await transcripts.emit('Add a task to buy milk');

  assert.deepEqual(handled, ['Add a task to buy milk']);
  assert.deepEqual(published, [
    Topics.lifeos.voiceWakeDetected,
    Topics.lifeos.voiceCommandReceived,
  ]);
  assert.deepEqual(spoken, ['Listening.', 'Added a task to buy milk.']);
});

test('wake phrase with inline command is handled immediately', async () => {
  const spoken: string[] = [];
  const core = new VoiceCore({
    speechToText: {
      async start() {
        return;
      },
      async stop() {
        return;
      },
    } as never,
    textToSpeech: {
      async speak(text: string) {
        spoken.push(text);
      },
    } as never,
    router: {
      async handleCommand(text: string) {
        return {
          handled: true,
          action: 'task_added',
          responseText: `Handled ${text}`,
        };
      },
    } as never,
  });

  const outcome = await core.runDemo('Hey LifeOS, add a task to buy milk');
  assert.equal(outcome?.handled, true);
  assert.equal(outcome?.action, 'task_added');
  assert.deepEqual(spoken, ['Handled add a task to buy milk']);
});
