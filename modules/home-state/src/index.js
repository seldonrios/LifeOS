import { randomUUID, timingSafeEqual } from 'node:crypto';
import { HouseholdHomeStateChangedSchema, HouseholdVoiceCaptureCreatedSchema, } from '@lifeos/contracts';
import { buildNextSnapshot } from '@lifeos/home-node-core';
import { Topics } from '@lifeos/module-sdk';
const DEFAULT_ACTOR_USER_ID = 'ha-bridge';
export function normalizeConsentedStateKeys(input) {
    if (!input) {
        return [];
    }
    const deduped = new Set();
    for (const key of input) {
        const normalized = key.trim();
        if (normalized.length > 0) {
            deduped.add(normalized);
        }
    }
    return Array.from(deduped);
}
export function parseHouseholdHomeStateConfig(configJson) {
    if (!configJson || configJson.trim().length === 0) {
        return {
            haIntegrationEnabled: false,
            haConsentedStateKeys: [],
        };
    }
    try {
        const parsed = JSON.parse(configJson);
        return {
            haIntegrationEnabled: parsed.haIntegrationEnabled === true,
            haConsentedStateKeys: normalizeConsentedStateKeys(parsed.haConsentedStateKeys),
        };
    }
    catch {
        return {
            haIntegrationEnabled: false,
            haConsentedStateKeys: [],
        };
    }
}
export function isStateKeyConsented(consentedStateKeys, stateKey) {
    const normalizedStateKey = stateKey.trim();
    if (normalizedStateKey.length === 0) {
        return false;
    }
    return consentedStateKeys.includes(normalizedStateKey);
}
export function validateWebhookSecret(expectedSecret, providedSecret) {
    if (!providedSecret) {
        return false;
    }
    const expectedBuffer = Buffer.from(expectedSecret.trim(), 'utf8');
    const providedBuffer = Buffer.from(providedSecret.trim(), 'utf8');
    if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) {
        return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
}
export function toBooleanHomeState(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value !== 'string') {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return (normalized === 'true' ||
        normalized === '1' ||
        normalized === 'on' ||
        normalized === 'home' ||
        normalized === 'present' ||
        normalized === 'active');
}
export function buildHomeStateChangedEventData(input) {
    return HouseholdHomeStateChangedSchema.parse({
        householdId: input.householdId,
        deviceId: input.deviceId,
        stateKey: input.stateKey,
        previousValue: input.previousValue,
        newValue: input.newValue,
        source: 'ha_bridge',
        consentVerified: input.consentVerified,
    });
}
export function buildHaVoiceCaptureEventData(input) {
    return HouseholdVoiceCaptureCreatedSchema.parse({
        captureId: randomUUID(),
        householdId: input.householdId,
        actorUserId: input.actorUserId?.trim() || DEFAULT_ACTOR_USER_ID,
        text: input.transcript.trim(),
        audioRef: null,
        source: 'ha_bridge',
        sourceDeviceId: input.sourceDeviceId,
        targetHint: input.targetHint,
        createdAt: new Date().toISOString(),
    });
}
function defaultSnapshot(now) {
    return {
        home_mode: 'home',
        occupancy_summary: 'unknown',
        active_routines: [],
        adapter_health: 'healthy',
        snapshot_at: now,
    };
}
function getCurrentSnapshot(snapshotsByHouseholdId, householdId) {
    const now = new Date().toISOString();
    return snapshotsByHouseholdId.get(householdId) ?? defaultSnapshot(now);
}
export const homeStateModule = {
    id: 'home-state',
    async init(context) {
        const snapshotsByHouseholdId = new Map();
        await context.subscribe(Topics.lifeos.householdHomeStateChanged, async (event) => {
            const payload = HouseholdHomeStateChangedSchema.parse(event.data);
            if (!payload.consentVerified) {
                context.log(`[home-state] skipped snapshot update for ${payload.householdId} because consent is not verified`);
                return;
            }
            const currentSnapshot = getCurrentSnapshot(snapshotsByHouseholdId, payload.householdId);
            const nextSnapshot = buildNextSnapshot(currentSnapshot, payload, new Date().toISOString());
            snapshotsByHouseholdId.set(payload.householdId, nextSnapshot);
            context.log(`[home-state] stored snapshot update for ${payload.householdId} from ${payload.stateKey}`);
        });
        await context.subscribe(Topics.lifeos.householdVoiceCaptureCreated, async (event) => {
            const payload = HouseholdVoiceCaptureCreatedSchema.parse(event.data);
            context.log(`[home-state] observed voice capture ${payload.captureId} for ${payload.householdId}`);
        });
        context.log('[home-state] initialized');
    },
};
export default homeStateModule;
