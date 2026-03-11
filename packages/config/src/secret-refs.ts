import type { SecretStore } from '@lifeos/secrets';

import { ConfigError } from './types';

const SECRET_REF_PATTERN = /^!secret\s+(.+)$/;

export async function resolveSecretRefs<T extends object>(
  config: T,
  secretStore: SecretStore,
): Promise<T> {
  async function walk(value: unknown, path: string): Promise<unknown> {
    if (typeof value === 'string') {
      const match = value.match(SECRET_REF_PATTERN);
      if (!match) {
        return value;
      }

      const secretName = match[1]?.trim();
      if (!secretName) {
        throw new ConfigError(`Invalid secret reference at ${path}.`);
      }

      const resolved = await secretStore.get(secretName);
      if (resolved === null) {
        throw new ConfigError(`Unable to resolve required secret '${secretName}' at ${path}.`);
      }

      return resolved;
    }

    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        output.push(await walk(value[index], `${path}[${index}]`));
      }
      return output;
    }

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value)) {
        output[key] = await walk(nested, path ? `${path}.${key}` : key);
      }
      return output;
    }

    return value;
  }

  return (await walk(config, 'config')) as T;
}
