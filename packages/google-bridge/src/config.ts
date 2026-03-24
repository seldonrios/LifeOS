import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const GOOGLE_BRIDGE_SUBFEATURES = [
  'calendar',
  'tasks',
  'gmail',
  'drive',
  'contacts',
] as const;

export type GoogleBridgeSubFeature = (typeof GOOGLE_BRIDGE_SUBFEATURES)[number];

const SUBFEATURE_SET = new Set<string>(GOOGLE_BRIDGE_SUBFEATURES);

export interface GoogleBridgeConfig {
  enabled: GoogleBridgeSubFeature[];
  updatedAt: string;
}

export interface GoogleBridgeConfigOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

export function getGoogleBridgeConfigPath(options: GoogleBridgeConfigOptions = {}): string {
  if (options.configPath) {
    return options.configPath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'modules', 'google-bridge', 'config.json');
}

function normalizeSubFeatures(value: unknown): GoogleBridgeSubFeature[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry): entry is GoogleBridgeSubFeature => SUBFEATURE_SET.has(entry));
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function defaultConfig(now = new Date()): GoogleBridgeConfig {
  return {
    enabled: [],
    updatedAt: now.toISOString(),
  };
}

export function parseGoogleBridgeSubFeatures(raw: string): GoogleBridgeSubFeature[] {
  return normalizeSubFeatures(raw.split(',').map((token) => token.trim()));
}

export async function getEnabledGoogleBridgeSubFeatures(
  options: GoogleBridgeConfigOptions = {},
): Promise<GoogleBridgeSubFeature[]> {
  const path = getGoogleBridgeConfigPath(options);
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return normalizeSubFeatures(parsed.enabled);
  } catch {
    return [];
  }
}

export async function setEnabledGoogleBridgeSubFeatures(
  subFeatures: readonly GoogleBridgeSubFeature[],
  options: GoogleBridgeConfigOptions = {},
): Promise<GoogleBridgeConfig> {
  const path = getGoogleBridgeConfigPath(options);
  const next: GoogleBridgeConfig = {
    enabled: normalizeSubFeatures(subFeatures),
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function updateGoogleBridgeSubFeatures(
  mutation: {
    mode: 'add' | 'remove';
    subFeatures: readonly GoogleBridgeSubFeature[];
  },
  options: GoogleBridgeConfigOptions = {},
): Promise<GoogleBridgeConfig> {
  const current = new Set(await getEnabledGoogleBridgeSubFeatures(options));
  for (const sub of mutation.subFeatures) {
    if (mutation.mode === 'add') {
      current.add(sub);
    } else {
      current.delete(sub);
    }
  }
  return setEnabledGoogleBridgeSubFeatures([...current], options);
}

export async function readGoogleBridgeConfig(
  options: GoogleBridgeConfigOptions = {},
): Promise<GoogleBridgeConfig> {
  const path = getGoogleBridgeConfigPath(options);
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return {
      enabled: normalizeSubFeatures(parsed.enabled),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultConfig();
  }
}
