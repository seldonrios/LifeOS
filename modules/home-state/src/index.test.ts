import assert from 'node:assert/strict';
import test from 'node:test';

import { HouseholdHaWebhookRequestSchema } from '@lifeos/contracts';

import {
  buildHaVoiceCaptureEventData,
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
