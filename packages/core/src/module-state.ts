import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { optionalModules, type OptionalModuleId } from './modules';

export interface ModuleStateRecord {
  enabledOptionalModules: OptionalModuleId[];
  updatedAt: string;
}

export interface ModuleStateOptions {
  env?: NodeJS.ProcessEnv;
  statePath?: string;
}

const OPTIONAL_SET = new Set<string>(optionalModules);

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

export function getModuleStatePath(options: ModuleStateOptions = {}): string {
  if (options.statePath) {
    return options.statePath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'modules.json');
}

function normalizeEnabledOptionalModules(value: unknown): OptionalModuleId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry): entry is OptionalModuleId => OPTIONAL_SET.has(entry));
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function defaultState(now = new Date()): ModuleStateRecord {
  return {
    enabledOptionalModules: [],
    updatedAt: now.toISOString(),
  };
}

export async function readModuleState(
  options: ModuleStateOptions = {},
): Promise<ModuleStateRecord> {
  const path = getModuleStatePath(options);
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    return {
      enabledOptionalModules: normalizeEnabledOptionalModules(raw.enabledOptionalModules),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
}

export async function writeModuleState(
  state: ModuleStateRecord,
  options: ModuleStateOptions = {},
): Promise<ModuleStateRecord> {
  const path = getModuleStatePath(options);
  const normalized: ModuleStateRecord = {
    enabledOptionalModules: normalizeEnabledOptionalModules(state.enabledOptionalModules),
    updatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function setOptionalModuleEnabled(
  moduleId: string,
  enabled: boolean,
  options: ModuleStateOptions = {},
): Promise<ModuleStateRecord> {
  const normalizedId = moduleId.trim().toLowerCase();
  if (!OPTIONAL_SET.has(normalizedId)) {
    throw new Error(`Optional module "${moduleId}" is not recognized.`);
  }

  const current = await readModuleState(options);
  const next = new Set(current.enabledOptionalModules);
  if (enabled) {
    next.add(normalizedId as OptionalModuleId);
  } else {
    next.delete(normalizedId as OptionalModuleId);
  }
  return writeModuleState(
    {
      enabledOptionalModules: [...next],
      updatedAt: new Date().toISOString(),
    },
    options,
  );
}
