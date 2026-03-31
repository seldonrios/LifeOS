import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  HouseholdHomeStateChangedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  type HouseholdHomeStateConfig,
} from '@lifeos/contracts';
import type { LifeOSModule } from '@lifeos/module-sdk';

const DEFAULT_ACTOR_USER_ID = 'ha-bridge';

export type ParsedHouseholdHomeStateConfig = {
  haIntegrationEnabled: boolean;
  haConsentedStateKeys: string[];
};

export function normalizeConsentedStateKeys(input: string[] | undefined): string[] {
  if (!input) {
    return [];
  }

  const deduped = new Set<string>();
  for (const key of input) {
    const normalized = key.trim();
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  }

  return Array.from(deduped);
}

export function parseHouseholdHomeStateConfig(
  configJson: string | null | undefined,
): ParsedHouseholdHomeStateConfig {
  if (!configJson || configJson.trim().length === 0) {
    return {
      haIntegrationEnabled: false,
      haConsentedStateKeys: [],
    };
  }

  try {
    const parsed = JSON.parse(configJson) as HouseholdHomeStateConfig;
    return {
      haIntegrationEnabled: parsed.haIntegrationEnabled === true,
      haConsentedStateKeys: normalizeConsentedStateKeys(parsed.haConsentedStateKeys),
    };
  } catch {
    return {
      haIntegrationEnabled: false,
      haConsentedStateKeys: [],
    };
  }
}

export function isStateKeyConsented(consentedStateKeys: string[], stateKey: string): boolean {
  const normalizedStateKey = stateKey.trim();
  if (normalizedStateKey.length === 0) {
    return false;
  }

  return consentedStateKeys.includes(normalizedStateKey);
}

export function validateWebhookSecret(
  expectedSecret: string,
  providedSecret: string | null | undefined,
): boolean {
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

export function toBooleanHomeState(value: unknown): boolean {
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
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'on' ||
    normalized === 'home' ||
    normalized === 'present' ||
    normalized === 'active'
  );
}

export function buildHomeStateChangedEventData(input: {
  householdId: string;
  deviceId: string;
  stateKey: string;
  previousValue: unknown;
  newValue: unknown;
  consentVerified: boolean;
}) {
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

export function buildHaVoiceCaptureEventData(input: {
  householdId: string;
  transcript: string;
  sourceDeviceId?: string;
  actorUserId?: string;
  targetHint?: 'shopping' | 'chore' | 'reminder' | 'note' | 'unknown';
}) {
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

export const homeStateModule: LifeOSModule = {
  id: 'home-state',
  async init(context) {
    context.log('[home-state] initialized');
  },
};

export default homeStateModule;
