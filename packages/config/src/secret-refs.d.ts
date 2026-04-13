import { type SecretRef, type SecretStore } from '@lifeos/secrets';
import { type FeatureEnabledPredicate, type ResolveSecretRefsResult } from './types';
export declare function resolveSecretRefs<T extends object>(config: T, secretStore: SecretStore, secretRefs?: SecretRef[], isFeatureEnabled?: FeatureEnabledPredicate): Promise<ResolveSecretRefsResult<T>>;
