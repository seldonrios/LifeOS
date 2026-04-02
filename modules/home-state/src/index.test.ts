import assert from 'node:assert/strict';
import test from 'node:test';

import { HouseholdHaWebhookRequestSchema } from '@lifeos/contracts';
import { Topics, type ModuleRuntimeContext } from '@lifeos/module-sdk';

import {
  buildHaVoiceCaptureEventData,
  buildHomeStateChangedEventData,
  homeStateModule,
  isStateKeyConsented,
  normalizeConsentedStateKeys,
  parseHouseholdHomeStateConfig,
  validateWebhookSecret,
} from './index';

test('validateWebhookSecret accepts matching secret and rejects invalid secret', () => {
  assert.equal(validateWebhookSecret('top-secret', 'top-secret'), true);
  assert.equal(validateWebhookSecret('top-secret', 'wrong-secret'), false);
  assert.equal(validateWebhookSecret('top-secret', ''), false);
});

test('validateWebhookSecret handles different-length secrets without throwing', () => {
  assert.doesNotThrow(() => {
    assert.equal(validateWebhookSecret('top-secret', 'x'), false);
  });
});

test('normalizeConsentedStateKeys trims and deduplicates', () => {
  const keys = normalizeConsentedStateKeys([' presence.alex ', 'presence.alex', 'device.kitchen']);
  assert.deepEqual(keys, ['presence.alex', 'device.kitchen']);
});

test('parseHouseholdHomeStateConfig parses valid json and defaults invalid values', () => {
  const parsed = parseHouseholdHomeStateConfig(
    JSON.stringify({
      haIntegrationEnabled: true,
      haConsentedStateKeys: ['presence.sam', ' device.entry '],
    }),
  );

  assert.equal(parsed.haIntegrationEnabled, true);
  assert.deepEqual(parsed.haConsentedStateKeys, ['presence.sam', 'device.entry']);

  const invalid = parseHouseholdHomeStateConfig('{');
  assert.equal(invalid.haIntegrationEnabled, false);
  assert.deepEqual(invalid.haConsentedStateKeys, []);
});

test('isStateKeyConsented only allows explicitly consented keys', () => {
  const consented = ['presence.sam', 'device.entry'];
  assert.equal(isStateKeyConsented(consented, 'presence.sam'), true);
  assert.equal(isStateKeyConsented(consented, 'presence.jordan'), false);
});

test('buildHaVoiceCaptureEventData emits ha_bridge voice payload with null audioRef', () => {
  const payload = buildHaVoiceCaptureEventData({
    householdId: 'house-1',
    transcript: 'add oat milk',
    sourceDeviceId: 'kitchen-speaker',
    targetHint: 'shopping',
  });

  assert.equal(payload.householdId, 'house-1');
  assert.equal(payload.text, 'add oat milk');
  assert.equal(payload.audioRef, null);
  assert.equal(payload.source, 'ha_bridge');
  assert.equal(payload.targetHint, 'shopping');
});

test('HouseholdHaWebhookRequestSchema accepts canonical voice_transcript field', () => {
  const parsed = HouseholdHaWebhookRequestSchema.parse({
    deviceId: 'kitchen-speaker',
    stateKey: 'presence.sam',
    newValue: 'home',
    voice_transcript: 'add oat milk',
  });

  assert.equal(parsed.voice_transcript, 'add oat milk');
});

test('HouseholdHaWebhookRequestSchema accepts camelCase alias and normalizes to voice_transcript', () => {
  const parsed = HouseholdHaWebhookRequestSchema.parse({
    deviceId: 'kitchen-speaker',
    stateKey: 'presence.sam',
    newValue: 'home',
    voiceTranscript: 'add bananas',
  });

  assert.equal(parsed.voice_transcript, 'add bananas');
});

function createModuleContextMock() {
  const handlers = new Map<string, (event: { data: unknown }) => Promise<void>>();
  const published: Array<{
    topic: string;
    data: Record<string, unknown>;
    source: string | undefined;
  }> = [];
  const logs: string[] = [];

  const context = {
    env: {},
    log(message: string) {
      logs.push(message);
    },
    async publish(topic: string, data: Record<string, unknown>, source?: string) {
      published.push({ topic, data, source });
    },
    async subscribe(topic: string, handler: (event: { data: unknown }) => Promise<void>) {
      handlers.set(topic, handler);
    },
  } as unknown as ModuleRuntimeContext;

  return { context, handlers, published, logs };
}

test('homeStateModule does not publish snapshot updates when consent is not verified', async () => {
  const { context, handlers, published } = createModuleContextMock();
  await homeStateModule.init(context);

  const handler = handlers.get(Topics.lifeos.householdHomeStateChanged);
  assert.ok(handler);

  await handler({
    data: buildHomeStateChangedEventData({
      householdId: 'house-1',
      deviceId: 'ha-entry',
      stateKey: 'presence.anyone_home',
      previousValue: false,
      newValue: true,
      consentVerified: false,
    }),
  });

  assert.equal(
    published.some((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated),
    false,
  );
});

test('homeStateModule publishes snapshot updates when consent is verified', async () => {
  const { context, handlers, published } = createModuleContextMock();
  await homeStateModule.init(context);

  const handler = handlers.get(Topics.lifeos.householdHomeStateChanged);
  assert.ok(handler);

  await handler({
    data: buildHomeStateChangedEventData({
      householdId: 'house-1',
      deviceId: 'ha-entry',
      stateKey: 'presence.anyone_home',
      previousValue: false,
      newValue: true,
      consentVerified: true,
    }),
  });

  assert.equal(
    published.some((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated),
    true,
  );
});
