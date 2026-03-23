import assert from 'node:assert/strict';
import test from 'node:test';

import { Topics } from '@lifeos/event-bus';

import { VoiceCore } from './index';

function createSpeechToTextMock() {
  let handler: ((event: { text: string; confidence: number }) => Promise<void>) | null = null;
  let transcribedText = 'Add a task to buy milk';

  return {
    stt: {
      async start(next: (event: { text: string; confidence: number }) => Promise<void>) {
        handler = next;
      },
      async transcribe() {
        return transcribedText;
      },
      async stop() {
        handler = null;
      },
    } as never,
    setTranscribedText(text: string) {
      transcribedText = text;
    },
    async emit(text: string, confidence = 0.9) {
      await handler?.({ text, confidence });
    },
  };
}

test('wake-only phrase triggers recorded-audio STT command flow', async () => {
  const transcripts = createSpeechToTextMock();
  const spoken: string[] = [];
  const published: string[] = [];
  const handled: string[] = [];

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
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    audioRecorder: {
      async record() {
        return Buffer.from([1, 2, 3, 4, 5]);
      },
    } as never,
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');

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
      async transcribe() {
        return '';
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
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
  });

  const outcome = await core.runDemo('Hey LifeOS, add a task to buy milk');
  assert.equal(outcome?.handled, true);
  assert.equal(outcome?.action, 'task_added');
  assert.deepEqual(spoken, ['Handled add a task to buy milk']);
});

test('wake capture records audio and includes wakeAudioBytes in command event metadata', async () => {
  const transcripts = createSpeechToTextMock();
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const spoken: string[] = [];

  const core = new VoiceCore({
    speechToText: transcripts.stt,
    textToSpeech: {
      async speak(text: string) {
        spoken.push(text);
      },
    } as never,
    router: {
      async handleCommand() {
        return {
          handled: true,
          action: 'task_added',
          responseText: 'ok',
        };
      },
    } as never,
    publish: async (topic, data) => {
      published.push({ topic, data });
    },
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    audioRecorder: {
      async record() {
        return Buffer.from([1, 2, 3, 4]);
      },
    } as never,
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');

  const commandEvent = published.find(
    (entry) => entry.topic === Topics.lifeos.voiceCommandReceived,
  );
  assert.ok(commandEvent);
  assert.equal(commandEvent?.data.audioBytes, 4);
  assert.equal(commandEvent?.data.source, 'audio_transcription');
  assert.deepEqual(spoken, ['Listening.', 'ok']);
});

test('wake-only falls back to transcript command when audio transcription is empty', async () => {
  const transcripts = createSpeechToTextMock();
  transcripts.setTranscribedText('');
  const handled: string[] = [];
  const spoken: string[] = [];

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
          responseText: 'ok',
        };
      },
    } as never,
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    audioRecorder: {
      async record() {
        return Buffer.from([1, 2, 3, 4]);
      },
    } as never,
    now: () => new Date('2026-03-23T00:00:00.000Z'),
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');
  await transcripts.emit('add a task to buy milk');

  assert.deepEqual(handled, ['add a task to buy milk']);
  assert.deepEqual(spoken, ['Listening.', "I didn't catch that. Please repeat.", 'ok']);
});

test('wake capture speaks default confirmation when handler returns empty response', async () => {
  const transcripts = createSpeechToTextMock();
  const spoken: string[] = [];

  const core = new VoiceCore({
    speechToText: transcripts.stt,
    textToSpeech: {
      async speak(text: string) {
        spoken.push(text);
      },
    } as never,
    router: {
      async handleCommand() {
        return {
          handled: true,
          action: 'task_added',
          responseText: '',
        };
      },
    } as never,
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    audioRecorder: {
      async record() {
        return Buffer.from([1, 2, 3, 4]);
      },
    } as never,
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');

  assert.deepEqual(spoken, ['Listening.', 'Understood.']);
});

test('router failures degrade to unhandled response instead of throwing', async () => {
  const transcripts = createSpeechToTextMock();
  const spoken: string[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];

  const core = new VoiceCore({
    speechToText: transcripts.stt,
    textToSpeech: {
      async speak(text: string) {
        spoken.push(text);
      },
    } as never,
    router: {
      async handleCommand() {
        throw new Error('graph unavailable');
      },
    } as never,
    publish: async (topic, data) => {
      published.push({ topic, data });
    },
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    audioRecorder: {
      async record() {
        return Buffer.from([1, 2, 3, 4]);
      },
    } as never,
  });

  await core.start();
  await transcripts.emit('Hey LifeOS');

  const unhandled = published.find((entry) => entry.topic === Topics.lifeos.voiceCommandUnhandled);
  assert.ok(unhandled);
  assert.match(String(unhandled?.data.reason), /graph unavailable/);
  assert.deepEqual(spoken, [
    'Listening.',
    'I ran into an internal error while handling that command.',
  ]);
});

test('close handles stt shutdown failures gracefully', async () => {
  const logs: string[] = [];
  const core = new VoiceCore({
    speechToText: {
      async start() {
        return;
      },
      async transcribe() {
        return '';
      },
      async stop() {
        throw new Error('stop failed');
      },
    } as never,
    textToSpeech: {
      async speak() {
        return;
      },
    } as never,
    router: {
      async handleCommand() {
        return {
          handled: false,
          action: 'unhandled',
          responseText: '',
        };
      },
    } as never,
    consentManager: {
      async hasConsent() {
        return true;
      },
    },
    logger: (line) => {
      logs.push(line);
    },
  });

  await core.close();
  assert.match(logs.join('\n'), /stt shutdown degraded/i);
});
