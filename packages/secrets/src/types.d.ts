export interface SecretStore {
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
}
export interface SecretRef {
    name: string;
    policy: 'required' | 'optional' | 'required_if_feature_enabled';
    featureGate?: string;
    configPath?: string;
}
export interface DegradedMarker {
    degraded: true;
    reason: string;
}
export declare class SecretsError extends Error {
    constructor(message: string);
}
