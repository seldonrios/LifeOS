import assert from 'node:assert/strict';
import test from 'node:test';
import { HouseholdHaWebhookRequestSchema } from '@lifeos/contracts';
import { Topics } from '@lifeos/module-sdk';
import { buildHaVoiceCaptureEventData, buildHomeStateChangedEventData, homeStateModule, isStateKeyConsented, normalizeConsentedStateKeys, parseHouseholdHomeStateConfig, validateWebhookSecret, } from './index';
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
    const parsed = parseHouseholdHomeStateConfig(JSON.stringify({
        haIntegrationEnabled: true,
        haConsentedStateKeys: ['presence.sam', ' device.entry '],
    }));
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
    const handlers = new Map();
    const published = [];
    const logs = [];
    const context = {
        env: {},
        log(message) {
            logs.push(message);
        },
        async publish(topic, data, source) {
            published.push({ topic, data, source });
        },
        async subscribe(topic, handler) {
            handlers.set(topic, handler);
        },
    };
    return { context, handlers, published, logs };
}
test('homeStateModule does not publish snapshot updates when consent is not verified', async () => {
    const { context, handlers, logs, published } = createModuleContextMock();
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
    assert.equal(published.some((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated), false);
    assert.equal(logs.some((message) => message.includes('skipped snapshot update for house-1 because consent is not verified')), true);
    assert.equal(logs.some((message) => message.includes('stored snapshot update for house-1')), false);
});
test('homeStateModule does not publish snapshot updates when consent is verified and stores state in memory', async () => {
    const { context, handlers, logs, published } = createModuleContextMock();
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
    assert.equal(published.some((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated), false);
    assert.equal(logs.some((message) => message.includes('stored snapshot update for house-1 from presence.anyone_home')), true);
    assert.equal(logs.some((message) => message.includes('skipped snapshot update for house-1 because consent is not verified')), false);
});
test('homeStateModule does not publish homeNodeStateSnapshotUpdated with any home_id', async () => {
    const { context, handlers, published } = createModuleContextMock();
    await homeStateModule.init(context);
    const handler = handlers.get(Topics.lifeos.householdHomeStateChanged);
    assert.ok(handler);
    await handler({
        data: buildHomeStateChangedEventData({
            householdId: 'house-real-1',
            deviceId: 'ha-entry',
            stateKey: 'presence.anyone_home',
            previousValue: false,
            newValue: true,
            consentVerified: true,
        }),
    });
    assert.equal(published.filter((entry) => entry.topic === Topics.lifeos.homeNodeStateSnapshotUpdated).length, 0);
});
