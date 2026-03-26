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
import { ConfigError, type LoadConfigOptions, type LoadConfigResult } from './types';

interface NodeErrnoException extends Error {
  code?: string;
  path?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isErrnoException(error: unknown): error is NodeErrnoException {
  return error instanceof Error && 'code' in error;
}

async function readYamlFile(path: string, required: boolean): Promise<Record<string, unknown>> {
  try {
    // Validate path is not empty
    if (!path || path.trim().length === 0) {
      throw new ConfigError('Config file path cannot be empty');
    }

    const content = await readFile(path, 'utf8');

    // Validate content is not empty before parsing
    if (!content || content.trim().length === 0) {
      if (required) {
        throw new ConfigError(`Config file is empty: ${path}`);
      }
      return {};
    }

    let parsed: unknown;
    try {
      parsed = parse(content) as unknown;
    } catch (parseError: unknown) {
      const detail = parseError instanceof Error ? parseError.message : String(parseError);
      throw new ConfigError(`YAML parsing failed in ${path}: ${detail}`);
    }

    if (!parsed) {
      return {};
    }

    if (!isRecord(parsed)) {
      throw new ConfigError(`YAML root must be an object in ${path}.`);
    }

    return parsed;
  } catch (error) {
    if (!required && isErrnoException(error) && error.code === 'ENOENT') {
      return {};
    }

    if (isErrnoException(error)) {
      if (error.code === 'EACCES') {
        throw new ConfigError(`Permission denied reading config file: ${path}`);
      }
      if (error.code === 'EISDIR') {
        throw new ConfigError(`Config path is a directory, not a file: ${path}`);
      }
      if (error.code === 'EMFILE') {
        throw new ConfigError('Too many open files: cannot read config');
      }
    }

    if (error instanceof ConfigError) {
      throw error;
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

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((output, segment) => {
    if (typeof segment === 'number') {
      return `${output}[${segment}]`;
    }

    const key = typeof segment === 'string' ? segment : String(segment);
    return output ? `${output}.${key}` : key;
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
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const rootDir = resolve(dirname(thisFile), '../../../');
    const configDir = resolve(rootDir, 'config');

    // Validate config directory exists
    if (!configDir || configDir.trim().length === 0) {
      throw new ConfigError('Config directory path is invalid');
    }

    const defaultsPath = resolve(configDir, 'defaults.yaml');
    const localPath = resolve(configDir, 'local.yaml');

    const defaultsConfig = await readYamlFile(defaultsPath, true);
    const localConfig = await readYamlFile(localPath, false);

    const profileName = options.profile ?? resolveProfile(process.env, localConfig, defaultsConfig);

    // Validate profile name
    if (!profileName || profileName.trim().length === 0) {
      throw new ConfigError('Profile name is invalid');
    }

    // Prevent path traversal attacks
    if (profileName.includes('..') || profileName.includes('/') || profileName.includes('\\')) {
      throw new ConfigError(`Invalid profile name: ${profileName}`);
    }

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
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    // Wrap unexpected errors
    throw new ConfigError(
      `Configuration loading failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
