import { ConfigError, LIFEOS_ENV_PREFIX } from './types';
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function parseRawValue(raw, template, pathText) {
    if (typeof template === 'boolean') {
        const lowered = raw.trim().toLowerCase();
        if (lowered === 'true' || lowered === '1') {
            return true;
        }
        if (lowered === 'false' || lowered === '0') {
            return false;
        }
        throw new ConfigError(`Invalid boolean for env override '${pathText}'.`);
    }
    if (typeof template === 'number') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            throw new ConfigError(`Invalid number for env override '${pathText}'.`);
        }
        return parsed;
    }
    if (typeof template === 'string') {
        return raw;
    }
    if (Array.isArray(template) || isRecord(template)) {
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new ConfigError(`Invalid JSON for env override '${pathText}'. Objects and arrays must be JSON encoded.`);
        }
    }
    throw new ConfigError(`Unsupported env override path '${pathText}'.`);
}
function getPathValue(root, path) {
    let cursor = root;
    for (const segment of path) {
        if (!isRecord(cursor) || !(segment in cursor)) {
            return undefined;
        }
        cursor = cursor[segment];
    }
    return cursor;
}
function setPathValue(root, path, value) {
    let cursor = root;
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index];
        if (!key) {
            throw new ConfigError('Invalid env override path segment.');
        }
        const next = cursor[key];
        if (!isRecord(next)) {
            throw new ConfigError(`Unknown env override path '${path.join('.')}'.`);
        }
        cursor = next;
    }
    const leaf = path[path.length - 1];
    if (!leaf || !(leaf in cursor)) {
        throw new ConfigError(`Unknown env override path '${path.join('.')}'.`);
    }
    cursor[leaf] = value;
}
export function applyEnvOverrides(config, env) {
    const output = JSON.parse(JSON.stringify(config));
    for (const [key, raw] of Object.entries(env)) {
        if (!key.startsWith(LIFEOS_ENV_PREFIX) || raw === undefined) {
            continue;
        }
        const segments = key
            .slice(LIFEOS_ENV_PREFIX.length)
            .split('__')
            .map((segment) => segment.trim())
            .filter((segment) => segment.length > 0);
        if (segments.length === 0) {
            throw new ConfigError(`Invalid env override key '${key}'.`);
        }
        const existingValue = getPathValue(output, segments);
        if (existingValue === undefined) {
            throw new ConfigError(`Unknown env override path '${segments.join('.')}'.`);
        }
        const parsed = parseRawValue(raw, existingValue, segments.join('.'));
        setPathValue(output, segments, parsed);
    }
    return output;
}
