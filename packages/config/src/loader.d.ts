import type { SecretStore } from '@lifeos/secrets';
import { type LoadConfigOptions, type LoadConfigResult } from './types';
export declare function loadConfig(options?: LoadConfigOptions & {
    secretStore?: SecretStore;
}): Promise<LoadConfigResult>;
