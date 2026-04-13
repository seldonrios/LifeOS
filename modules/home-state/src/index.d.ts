import { type LifeOSModule } from '@lifeos/module-sdk';
export type ParsedHouseholdHomeStateConfig = {
    haIntegrationEnabled: boolean;
    haConsentedStateKeys: string[];
};
export declare function normalizeConsentedStateKeys(input: string[] | undefined): string[];
export declare function parseHouseholdHomeStateConfig(configJson: string | null | undefined): ParsedHouseholdHomeStateConfig;
export declare function isStateKeyConsented(consentedStateKeys: string[], stateKey: string): boolean;
export declare function validateWebhookSecret(expectedSecret: string, providedSecret: string | null | undefined): boolean;
export declare function toBooleanHomeState(value: unknown): boolean;
export declare function buildHomeStateChangedEventData(input: {
    householdId: string;
    deviceId: string;
    stateKey: string;
    previousValue: unknown;
    newValue: unknown;
    consentVerified: boolean;
}): {
    householdId: string;
    deviceId: string;
    stateKey: string;
    previousValue: unknown;
    newValue: unknown;
    source: "ha_bridge" | "manual" | "routine";
    consentVerified: boolean;
};
export declare function buildHaVoiceCaptureEventData(input: {
    householdId: string;
    transcript: string;
    sourceDeviceId?: string;
    actorUserId?: string;
    targetHint?: 'shopping' | 'chore' | 'reminder' | 'note' | 'unknown';
}): {
    captureId: string;
    householdId: string;
    actorUserId: string;
    text: string;
    audioRef: string | null;
    source: "mobile" | "ha_satellite" | "ha_bridge";
    createdAt: string;
    sourceDeviceId?: string | undefined;
    targetHint?: "unknown" | "shopping" | "chore" | "reminder" | "note" | undefined;
};
export declare const homeStateModule: LifeOSModule;
export default homeStateModule;
