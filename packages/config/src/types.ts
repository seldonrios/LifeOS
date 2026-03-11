import type { z } from 'zod';

import type { ConfigSchema } from './schema';

export const LIFEOS_ENV_PREFIX = 'LIFEOS__';

export type ResolvedConfig = z.infer<typeof ConfigSchema>;

export interface LoadConfigOptions {
  profile?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
