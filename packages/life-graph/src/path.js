import { homedir } from 'node:os';
import { isAbsolute, posix, resolve, win32 } from 'node:path';
function normalizeBaseDir(baseDir) {
    return baseDir?.trim() ? resolve(baseDir) : process.cwd();
}
function getEnvPathValue(env) {
    const value = env.LIFEOS_GRAPH_PATH?.trim();
    return value ? value : null;
}
function resolveConfiguredGraphPath(pathValue, baseDir) {
    if (isAbsolute(pathValue)) {
        return pathValue;
    }
    return resolve(baseDir, pathValue);
}
function joinByPlatform(platform, ...parts) {
    if (platform === 'win32') {
        return win32.join(...parts);
    }
    return posix.join(...parts);
}
function resolveUserDataRoot(env, platform, homeDir) {
    if (platform === 'win32') {
        return env.APPDATA?.trim() || joinByPlatform(platform, homeDir, 'AppData', 'Roaming');
    }
    return env.XDG_DATA_HOME?.trim() || joinByPlatform(platform, homeDir, '.local', 'share');
}
export function getDefaultLifeGraphPath(baseDirOrOptions = {}) {
    const options = typeof baseDirOrOptions === 'string'
        ? { baseDir: baseDirOrOptions }
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
export function resolveLifeGraphPath(graphPath, options = {}) {
    if (!graphPath?.trim()) {
        return getDefaultLifeGraphPath(options);
    }
    if (isAbsolute(graphPath)) {
        return graphPath;
    }
    const baseDir = normalizeBaseDir(options.baseDir);
    return resolve(baseDir, graphPath);
}
