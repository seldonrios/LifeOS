import type { DegradedMarker, SecretRef } from './types';
export declare function applySecretPolicy(ref: SecretRef, value: string | null, featureEnabled?: boolean): string | DegradedMarker;
