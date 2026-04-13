import { readFile } from 'node:fs/promises';
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PACKAGE_NAME_PATTERN = /^@lifeos\/[a-z0-9-]+$/;
const PACKAGE_REQUIREMENT_PATTERN = /^(@lifeos\/[a-z0-9-]+)(?:@(.+))?$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;
const SUB_FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const CPU_TIERS = new Set(['low', 'medium', 'high']);
const MEMORY_TIERS = new Set(['low', 'medium']);
const MAX_STRING_LENGTH = 1000;
const MAX_AUTHOR_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TAGS = 20;
const MAX_SUB_FEATURES = 10;
const MAX_REQUIRES = 15;
function parseSemver(value) {
    const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}
function compareSemver(left, right) {
    if (left.major !== right.major) {
        return left.major - right.major;
    }
    if (left.minor !== right.minor) {
        return left.minor - right.minor;
    }
    return left.patch - right.patch;
}
function incrementMinor(version) {
    return {
        major: version.major,
        minor: version.minor + 1,
        patch: 0,
    };
}
function incrementMajor(version) {
    return {
        major: version.major + 1,
        minor: 0,
        patch: 0,
    };
}
function hasValidRangeTokens(range) {
    const trimmed = range.trim();
    if (!trimmed) {
        return false;
    }
    const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return false;
    }
    for (const token of tokens) {
        if (token.startsWith('>=')) {
            if (!parseSemver(token.slice(2))) {
                return false;
            }
            continue;
        }
        if (token.startsWith('>')) {
            if (!parseSemver(token.slice(1))) {
                return false;
            }
            continue;
        }
        if (token.startsWith('<=')) {
            if (!parseSemver(token.slice(2))) {
                return false;
            }
            continue;
        }
        if (token.startsWith('<')) {
            if (!parseSemver(token.slice(1))) {
                return false;
            }
            continue;
        }
        if (token.startsWith('^') || token.startsWith('~')) {
            if (!parseSemver(token.slice(1))) {
                return false;
            }
            continue;
        }
        if (!parseSemver(token)) {
            return false;
        }
    }
    return true;
}
function satisfiesRange(versionText, range) {
    const version = parseSemver(versionText);
    if (!version) {
        return false;
    }
    const tokens = range.trim().split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return false;
    }
    for (const token of tokens) {
        if (token.startsWith('>=')) {
            const min = parseSemver(token.slice(2));
            if (!min || compareSemver(version, min) < 0) {
                return false;
            }
            continue;
        }
        if (token.startsWith('>')) {
            const min = parseSemver(token.slice(1));
            if (!min || compareSemver(version, min) <= 0) {
                return false;
            }
            continue;
        }
        if (token.startsWith('<=')) {
            const max = parseSemver(token.slice(2));
            if (!max || compareSemver(version, max) > 0) {
                return false;
            }
            continue;
        }
        if (token.startsWith('<')) {
            const max = parseSemver(token.slice(1));
            if (!max || compareSemver(version, max) >= 0) {
                return false;
            }
            continue;
        }
        if (token.startsWith('^')) {
            const base = parseSemver(token.slice(1));
            if (!base) {
                return false;
            }
            const upper = base.major > 0 ? incrementMajor(base) : incrementMinor(base);
            if (compareSemver(version, base) < 0 || compareSemver(version, upper) >= 0) {
                return false;
            }
            continue;
        }
        if (token.startsWith('~')) {
            const base = parseSemver(token.slice(1));
            if (!base) {
                return false;
            }
            const upper = incrementMinor(base);
            if (compareSemver(version, base) < 0 || compareSemver(version, upper) >= 0) {
                return false;
            }
            continue;
        }
        const exact = parseSemver(token);
        if (!exact || compareSemver(version, exact) !== 0) {
            return false;
        }
    }
    return true;
}
function getString(value, maxLength = MAX_STRING_LENGTH) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    // Security: Prevent null bytes
    if (trimmed.includes('\0')) {
        return null;
    }
    // Security: Enforce max length
    if (trimmed.length > maxLength) {
        return null;
    }
    return trimmed.length > 0 ? trimmed : null;
}
function toStringArray(value, maxItems, maxItemLength = MAX_STRING_LENGTH) {
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = value
        .slice(0, maxItems)
        .map((item) => {
        if (typeof item !== 'string') {
            return '';
        }
        const trimmed = item.trim();
        // Prevent null bytes
        if (trimmed.includes('\0')) {
            return '';
        }
        // Enforce max length
        if (trimmed.length > maxItemLength) {
            return '';
        }
        return trimmed;
    })
        .filter((item) => item.length > 0);
    return normalized;
}
function normalizePermissions(value) {
    const record = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    return {
        graph: toStringArray(record.graph, 10),
        network: toStringArray(record.network, 10),
        voice: toStringArray(record.voice, 10),
        events: toStringArray(record.events, 50),
    };
}
function normalizeResources(value) {
    const record = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const cpu = getString(record.cpu)?.toLowerCase();
    const memory = getString(record.memory)?.toLowerCase();
    if (!cpu || !memory || !CPU_TIERS.has(cpu) || !MEMORY_TIERS.has(memory)) {
        return null;
    }
    return {
        cpu: cpu,
        memory: memory,
    };
}
function buildManifestCandidate(raw) {
    const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const description = getString(record.description, MAX_DESCRIPTION_LENGTH);
    return {
        name: getString(record.name) ?? '',
        version: getString(record.version) ?? '',
        author: getString(record.author, MAX_AUTHOR_LENGTH) ?? '',
        ...(description ? { description } : {}),
        permissions: normalizePermissions(record.permissions),
        resources: normalizeResources(record.resources) ?? { cpu: 'low', memory: 'low' },
        ...(Array.isArray(record.subFeatures)
            ? { subFeatures: toStringArray(record.subFeatures, MAX_SUB_FEATURES) }
            : {}),
        requires: toStringArray(record.requires, MAX_REQUIRES),
        category: getString(record.category) ?? '',
        tags: toStringArray(record.tags, MAX_TAGS),
    };
}
export function validateLifeOSManifest(raw, options = {}) {
    const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const resourceRecord = record.resources && typeof record.resources === 'object' && !Array.isArray(record.resources)
        ? record.resources
        : null;
    const manifest = buildManifestCandidate(raw);
    const errors = [];
    // Validate manifest structure exists
    if (!record || typeof record !== 'object') {
        errors.push('Manifest must be a valid JSON object.');
        return { valid: false, errors };
    }
    // Validate required fields are present
    if (!record.name) {
        errors.push('manifest.name is required.');
    }
    if (!record.version) {
        errors.push('manifest.version is required.');
    }
    if (!record.author) {
        errors.push('manifest.author is required.');
    }
    if (!record.category) {
        errors.push('manifest.category is required.');
    }
    if (!record.permissions) {
        errors.push('manifest.permissions is required.');
    }
    if (!record.resources) {
        errors.push('manifest.resources is required.');
    }
    if (!NAME_PATTERN.test(manifest.name)) {
        errors.push('manifest.name must be kebab-case (letters, numbers, hyphens) and 2-63 characters.');
    }
    if (!SEMVER_PATTERN.test(manifest.version)) {
        errors.push('manifest.version must be semver, e.g. "0.1.0".');
    }
    if (!getString(manifest.author)) {
        errors.push('manifest.author is required and cannot be empty.');
    }
    if (!CATEGORY_PATTERN.test(manifest.category)) {
        errors.push('manifest.category must be kebab-case and 2-41 characters.');
    }
    if (!resourceRecord) {
        errors.push('manifest.resources is required and must include cpu and memory tiers.');
    }
    const cpuTier = getString(resourceRecord?.cpu)?.toLowerCase();
    const memoryTier = getString(resourceRecord?.memory)?.toLowerCase();
    if (!cpuTier || !CPU_TIERS.has(cpuTier)) {
        errors.push('manifest.resources.cpu must be one of: low, medium, high.');
    }
    if (!memoryTier || !MEMORY_TIERS.has(memoryTier)) {
        errors.push('manifest.resources.memory must be one of: low, medium.');
    }
    // Validate requires
    if (manifest.requires.length > MAX_REQUIRES) {
        errors.push(`manifest.requires cannot exceed ${MAX_REQUIRES} entries.`);
    }
    for (const requiredPackage of manifest.requires) {
        const packageMatch = requiredPackage.match(PACKAGE_REQUIREMENT_PATTERN);
        const packageName = packageMatch?.[1] ?? '';
        const packageRange = packageMatch?.[2]?.trim() ?? '';
        if (!PACKAGE_NAME_PATTERN.test(packageName)) {
            errors.push(`manifest.requires entry "${requiredPackage}" must look like "@lifeos/<package>".`);
            continue;
        }
        if (packageRange && !hasValidRangeTokens(packageRange)) {
            errors.push(`manifest.requires entry "${requiredPackage}" has invalid semver range "${packageRange}".`);
            continue;
        }
        if (options.cliVersion && packageRange && !satisfiesRange(options.cliVersion, packageRange)) {
            errors.push(`manifest.requires entry "${requiredPackage}" is incompatible with CLI ${options.cliVersion}.`);
        }
    }
    // Validate tags
    if (manifest.tags.length > MAX_TAGS) {
        errors.push(`manifest.tags cannot exceed ${MAX_TAGS} entries.`);
    }
    for (const tag of manifest.tags) {
        if (!TAG_PATTERN.test(tag)) {
            errors.push(`manifest.tags entry "${tag}" is invalid. Use lowercase kebab-case tags.`);
        }
    }
    // Validate subFeatures
    if (manifest.subFeatures && manifest.subFeatures.length > MAX_SUB_FEATURES) {
        errors.push(`manifest.subFeatures cannot exceed ${MAX_SUB_FEATURES} entries.`);
    }
    if (manifest.subFeatures) {
        for (const subFeature of manifest.subFeatures) {
            if (!SUB_FEATURE_PATTERN.test(subFeature)) {
                errors.push(`manifest.subFeatures entry "${subFeature}" is invalid. Use lowercase kebab-case names.`);
            }
        }
    }
    // Validate permissions are present
    if (manifest.permissions.graph.length === 0 &&
        manifest.permissions.network.length === 0 &&
        manifest.permissions.voice.length === 0 &&
        manifest.permissions.events.length === 0) {
        errors.push('manifest.permissions must declare at least one permission.');
    }
    // Validate event permissions format
    if (manifest.permissions.events.some((entry) => !/^(subscribe|publish):[A-Za-z0-9.*>_-]+(?:\.[A-Za-z0-9.*>_-]+)*$/.test(entry))) {
        errors.push('manifest.permissions.events entries must use "subscribe:<topic>" or "publish:<topic>".');
    }
    return {
        valid: errors.length === 0,
        errors,
        ...(errors.length === 0 ? { manifest } : {}),
    };
}
export async function readLifeOSManifestFile(path) {
    let raw;
    try {
        const contents = await readFile(path, 'utf8');
        raw = JSON.parse(contents);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            valid: false,
            errors: [`Unable to read or parse manifest at ${path}: ${message}`],
        };
    }
    return validateLifeOSManifest(raw);
}
