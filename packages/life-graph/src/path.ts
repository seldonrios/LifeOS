import { homedir } from 'node:os';
import { isAbsolute, posix, resolve, win32 } from 'node:path';

export interface LifeGraphPathOptions {
  baseDir?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}

function normalizeBaseDir(baseDir?: string): string {
  return baseDir?.trim() ? resolve(baseDir) : process.cwd();
}

function getEnvPathValue(env: NodeJS.ProcessEnv): string | null {
  const value = env.LIFEOS_GRAPH_PATH?.trim();
  return value ? value : null;
}

function resolveConfiguredGraphPath(pathValue: string, baseDir: string): string {
  if (isAbsolute(pathValue)) {
    return pathValue;
  }

  return resolve(baseDir, pathValue);
}

function joinByPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  if (platform === 'win32') {
    return win32.join(...parts);
  }

  return posix.join(...parts);
}

function resolveUserDataRoot(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDir: string,
): string {
  if (platform === 'win32') {
    return env.APPDATA?.trim() || joinByPlatform(platform, homeDir, 'AppData', 'Roaming');
  }

  return env.XDG_DATA_HOME?.trim() || joinByPlatform(platform, homeDir, '.local', 'share');
}

export function getDefaultLifeGraphPath(baseDir?: string): string;
export function getDefaultLifeGraphPath(options?: LifeGraphPathOptions): string;
export function getDefaultLifeGraphPath(
  baseDirOrOptions: string | LifeGraphPathOptions = {},
): string {
  const options =
    typeof baseDirOrOptions === 'string'
      ? ({ baseDir: baseDirOrOptions } satisfies LifeGraphPathOptions)
      : baseDirOrOptions;

  const env = options.env ?? process.env;
  const baseDir = normalizeBaseDir(options.baseDir);
  const configuredPath = getEnvPathValue(env);
  if (configuredPath) {
    return resolveConfiguredGraphPath(configuredPath, baseDir);
  }

  const platform = options.platform ?? process.platform;
  const userHome = options.homeDir ?? homedir();
  const userDataRoot = resolveUserDataRoot(env, platform, userHome);

  return joinByPlatform(platform, userDataRoot, 'lifeos', 'life-graph.json');
}

export function resolveLifeGraphPath(
  graphPath?: string,
  options: LifeGraphPathOptions = {},
): string {
  if (!graphPath?.trim()) {
    return getDefaultLifeGraphPath(options);
  }

  if (isAbsolute(graphPath)) {
    return graphPath;
  }

  const baseDir = normalizeBaseDir(options.baseDir);
  return resolve(baseDir, graphPath);
}
