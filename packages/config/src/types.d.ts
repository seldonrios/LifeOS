import type { z } from 'zod';
import type { DegradedMarker, SecretRef } from '@lifeos/secrets';
import type { ConfigSchema } from './schema';
export declare const LIFEOS_ENV_PREFIX = "LIFEOS__";
export type ResolvedConfig = z.infer<typeof ConfigSchema>;
export type FeatureEnabledPredicate = (gate: string) => boolean | Promise<boolean>;
export interface SecretResolutionOutcome {
    name: string;
    path: string;
    status: 'resolved' | 'degraded';
    value?: string;
    marker?: DegradedMarker;
}
export interface ResolveSecretRefsResult<T extends object> {
    config: T;
    degraded: DegradedMarker[];
    degradedPaths: string[];
    secretOutcomes: SecretResolutionOutcome[];
}
export interface LoadConfigResult {
    config: ResolvedConfig;
    degraded: DegradedMarker[];
    degradedPaths: string[];
    secretOutcomes: SecretResolutionOutcome[];
}
export interface LoadConfigOptions {
    profile?: string;
    secretRefs?: SecretRef[];
    isFeatureEnabled?: FeatureEnabledPredicate;
}
export declare class ConfigError extends Error {
    constructor(message: string);
}
