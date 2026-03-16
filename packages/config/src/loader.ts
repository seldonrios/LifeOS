import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SecretStore } from '@lifeos/secrets';
import { ZodIssue } from 'zod';
import { parse } from 'yaml';

import { applyEnvOverrides } from './env-override';
import { resolveProfile } from './profile';
import { ConfigSchema } from './schema';
import { resolveSecretRefs } from './secret-refs';
import {
  ConfigError,
  type LoadConfigOptions,
  type LoadConfigResult,
} from './types';

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

function formatIssuePath(path: Array<string | number>): string {
  return path.reduce<string>((output, segment) => {
    if (typeof segment === 'number') {
      return `${output}[${segment}]`;
    }

    return output ? `${output}.${segment}` : segment;
  }, '');
}

function isDegradedPathIssue(issue: ZodIssue, degradedPaths: Set<string>): boolean {
  if (!degradedPaths.has(formatIssuePath(issue.path))) {
    return false;
  }

  return issue.code === 'invalid_type';
}

export async function loadConfig(
  options: LoadConfigOptions & { secretStore?: SecretStore } = {},
): Promise<LoadConfigResult> {
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

  const defaultIsFeatureEnabled = (gate: string): boolean => {
    const features = parsedBeforeSecrets.data.features as Record<string, unknown>;
    return features[gate] === true;
  };

  const secretResolution = options.secretStore
    ? await resolveSecretRefs(
        parsedBeforeSecrets.data,
        options.secretStore,
        options.secretRefs,
        options.isFeatureEnabled ?? defaultIsFeatureEnabled,
      )
    : {
        config: parsedBeforeSecrets.data,
        degraded: [],
        degradedPaths: [],
        secretOutcomes: [],
      };

  const parsedFinal = ConfigSchema.safeParse(secretResolution.config);
  if (!parsedFinal.success) {
    const degradedPaths = new Set(secretResolution.degradedPaths);
    const remainingIssues = parsedFinal.error.issues.filter(
      (issue) => !isDegradedPathIssue(issue, degradedPaths),
    );

    if (remainingIssues.length > 0) {
      throw new ConfigError(`Invalid resolved configuration: ${parsedFinal.error.message}`);
    }

    return {
      config: secretResolution.config as LoadConfigResult['config'],
      degraded: secretResolution.degraded,
      degradedPaths: secretResolution.degradedPaths,
      secretOutcomes: secretResolution.secretOutcomes,
    };
  }

  return {
    config: parsedFinal.data,
    degraded: secretResolution.degraded,
    degradedPaths: secretResolution.degradedPaths,
    secretOutcomes: secretResolution.secretOutcomes,
  };
}
