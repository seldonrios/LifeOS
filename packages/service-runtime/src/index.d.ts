export * from './types';
import { type ResolvedConfig } from '@lifeos/config';
import type { SecretStore } from '@lifeos/secrets';
import type { ServiceRuntimeOptions, ServiceRuntimePhase } from './types';
interface InternalServiceRuntimeOptions extends ServiceRuntimeOptions {
    onAuthPolicy?: (config: ResolvedConfig) => Promise<void>;
    onPhase?: (phase: ServiceRuntimePhase) => void | Promise<void>;
}
export declare function createEnvSecretStore(): SecretStore;
export declare function startService(opts: InternalServiceRuntimeOptions): Promise<void>;
