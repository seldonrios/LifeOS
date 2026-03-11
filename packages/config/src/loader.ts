import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SecretStore } from '@lifeos/secrets';
import { parse } from 'yaml';

import { applyEnvOverrides } from './env-override';
import { resolveProfile } from './profile';
import { ConfigSchema } from './schema';
import { resolveSecretRefs } from './secret-refs';
import { ConfigError, type LoadConfigOptions, type ResolvedConfig } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readYamlFile(path: string, required: boolean): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, 'utf8');
    const parsed = parse(content) as unknown;
    if (!parsed) {
      return {};
    }
    if (!isRecord(parsed)) {
      throw new ConfigError(`YAML root must be an object in ${path}.`);
    }
    return parsed;
  } catch (error) {
    if (!required && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === null) {
    return undefined;
  }

  if (Array.isArray(override)) {
    return JSON.parse(JSON.stringify(override)) as unknown;
  }

  if (isRecord(base) && isRecord(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, overrideValue] of Object.entries(override)) {
      const merged = deepMerge(out[key], overrideValue);
      if (merged === undefined) {
        delete out[key];
      } else {
        out[key] = merged;
      }
    }
    return out;
  }

  return override === undefined ? base : override;
}

export async function loadConfig(
  options: LoadConfigOptions & { secretStore?: SecretStore } = {},
): Promise<ResolvedConfig> {
  const thisFile = fileURLToPath(import.meta.url);
  const rootDir = resolve(dirname(thisFile), '../../../');
  const configDir = resolve(rootDir, 'config');

  const defaultsPath = resolve(configDir, 'defaults.yaml');
  const localPath = resolve(configDir, 'local.yaml');

  const defaultsConfig = await readYamlFile(defaultsPath, true);
  const localConfig = await readYamlFile(localPath, false);

  const profileName = options.profile ?? resolveProfile(process.env, localConfig, defaultsConfig);
  const profilePath = resolve(configDir, 'profiles', `${profileName}.yaml`);
  const profileConfig = await readYamlFile(profilePath, false);

  const merged = deepMerge(deepMerge(defaultsConfig, profileConfig), localConfig);
  if (!isRecord(merged)) {
    throw new ConfigError('Merged config must be an object.');
  }

  const withEnvOverrides = applyEnvOverrides(merged, process.env);
  const parsedBeforeSecrets = ConfigSchema.safeParse(withEnvOverrides);
  if (!parsedBeforeSecrets.success) {
    throw new ConfigError(`Invalid configuration: ${parsedBeforeSecrets.error.message}`);
  }

  const withResolvedSecrets = options.secretStore
    ? await resolveSecretRefs(parsedBeforeSecrets.data, options.secretStore)
    : parsedBeforeSecrets.data;

  const parsedFinal = ConfigSchema.safeParse(withResolvedSecrets);
  if (!parsedFinal.success) {
    throw new ConfigError(`Invalid resolved configuration: ${parsedFinal.error.message}`);
  }

  return parsedFinal.data;
}
