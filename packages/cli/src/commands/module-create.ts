import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MODULE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const PACKAGE_NAME_PATTERN = /^@lifeos\/[a-z0-9-]+$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;
const SUB_FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const CPU_TIERS = new Set(['low', 'medium', 'high']);
const MEMORY_TIERS = new Set(['low', 'medium']);

export interface ModuleCreateOptions {
  baseDir: string;
  author: string;
}

export interface ModuleCreateResult {
  moduleName: string;
  modulePath: string;
  manifestPath: string;
}

export interface ModuleValidateResult {
  valid: boolean;
  manifestPath: string;
  errors: string[];
}

interface RawManifestPermissions {
  graph: string[];
  network: string[];
  voice: string[];
  events: string[];
}

interface RawManifestResources {
  cpu: string;
  memory: string;
}

interface RawManifest {
  name: string;
  version: string;
  author: string;
  permissions: RawManifestPermissions;
  resources: RawManifestResources;
  subFeatures?: string[];
  requires: string[];
  category: string;
  tags: string[];
}

function parseEventPermission(
  permission: string,
): { action: 'subscribe' | 'publish'; topic: string } | null {
  const parts = permission.split(':', 2);
  if (parts.length !== 2) {
    return null;
  }
  const action = parts[0];
  const topic = parts[1];
  if (!action || !topic || (action !== 'subscribe' && action !== 'publish')) {
    return null;
  }
  return {
    action,
    topic,
  };
}

function toModuleIdentifier(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function validateManifest(raw: unknown): string[] {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const permissionRecord =
    record.permissions && typeof record.permissions === 'object'
      ? (record.permissions as Record<string, unknown>)
      : null;
  const resourceRecord =
    record.resources && typeof record.resources === 'object'
      ? (record.resources as Record<string, unknown>)
      : null;

  const manifest: RawManifest = {
    name: typeof record.name === 'string' ? record.name.trim() : '',
    version: typeof record.version === 'string' ? record.version.trim() : '',
    author: typeof record.author === 'string' ? record.author.trim() : '',
    permissions: permissionRecord
      ? {
          graph: toStringArray(permissionRecord.graph),
          network: toStringArray(permissionRecord.network),
          voice: toStringArray(permissionRecord.voice),
          events: toStringArray(permissionRecord.events),
        }
      : {
          graph: [],
          network: [],
          voice: [],
          events: [],
        },
    resources: resourceRecord
      ? {
          cpu:
            typeof resourceRecord.cpu === 'string' ? resourceRecord.cpu.trim().toLowerCase() : '',
          memory:
            typeof resourceRecord.memory === 'string'
              ? resourceRecord.memory.trim().toLowerCase()
              : '',
        }
      : {
          cpu: '',
          memory: '',
        },
    ...(Array.isArray(record.subFeatures)
      ? { subFeatures: toStringArray(record.subFeatures) }
      : {}),
    requires: toStringArray(record.requires),
    category: typeof record.category === 'string' ? record.category.trim() : '',
    tags: toStringArray(record.tags),
  };

  const errors: string[] = [];
  if (!MODULE_NAME_PATTERN.test(manifest.name)) {
    errors.push('manifest.name must be lowercase kebab-case.');
  }
  if (!SEMVER_PATTERN.test(manifest.version)) {
    errors.push('manifest.version must be semver (example: 0.1.0).');
  }
  if (manifest.author.length === 0) {
    errors.push('manifest.author is required.');
  }
  if (!CATEGORY_PATTERN.test(manifest.category)) {
    errors.push('manifest.category must be lowercase kebab-case.');
  }
  if (!CPU_TIERS.has(manifest.resources.cpu)) {
    errors.push('manifest.resources.cpu must be one of: low, medium, high.');
  }
  if (!MEMORY_TIERS.has(manifest.resources.memory)) {
    errors.push('manifest.resources.memory must be one of: low, medium.');
  }
  for (const requiredPackage of manifest.requires) {
    if (!PACKAGE_NAME_PATTERN.test(requiredPackage)) {
      errors.push(`manifest.requires entry "${requiredPackage}" must be "@lifeos/<package>".`);
    }
  }
  for (const tag of manifest.tags) {
    if (!TAG_PATTERN.test(tag)) {
      errors.push(`manifest.tags entry "${tag}" is invalid.`);
    }
  }
  for (const subFeature of manifest.subFeatures ?? []) {
    if (!SUB_FEATURE_PATTERN.test(subFeature)) {
      errors.push(`manifest.subFeatures entry "${subFeature}" is invalid.`);
    }
  }
  for (const eventPermission of manifest.permissions.events) {
    if (!/^(subscribe|publish):[A-Za-z0-9.*>_-]+(?:\.[A-Za-z0-9.*>_-]+)*$/.test(eventPermission)) {
      errors.push(
        `manifest.permissions.events entry "${eventPermission}" must be subscribe:<topic> or publish:<topic>.`,
      );
      continue;
    }

    const parsed = parseEventPermission(eventPermission);
    if (!parsed) {
      errors.push(`manifest.permissions.events entry "${eventPermission}" is malformed.`);
      continue;
    }

    if (parsed.action === 'publish' && (parsed.topic.includes('*') || parsed.topic.includes('>'))) {
      errors.push(
        `manifest.permissions.events publish entry "${eventPermission}" is too broad; publish permissions cannot contain "*" or ">".`,
      );
    }
  }

  return errors;
}

export async function createModuleScaffold(
  moduleName: string,
  options: ModuleCreateOptions,
): Promise<ModuleCreateResult> {
  const normalizedName = moduleName.trim().toLowerCase();
  if (!MODULE_NAME_PATTERN.test(normalizedName)) {
    throw new Error(
      'Module name must be kebab-case and use only lowercase letters, numbers, and hyphens.',
    );
  }

  const modulePath = resolve(options.baseDir, 'modules', normalizedName);
  try {
    await stat(modulePath);
    throw new Error(`Module "${normalizedName}" already exists.`);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  await mkdir(join(modulePath, 'src'), { recursive: true });

  const manifestPath = join(modulePath, 'lifeos.json');
  const manifest = {
    name: normalizedName,
    version: '0.1.0',
    author: options.author,
    description: `LifeOS module: ${normalizedName}`,
    permissions: {
      graph: ['read'],
      network: [],
      voice: [],
      events: ['subscribe:lifeos.tick'],
    },
    resources: {
      cpu: 'low',
      memory: 'low',
    },
    requires: ['@lifeos/voice-core', '@lifeos/life-graph'],
    category: 'custom',
    tags: ['custom'],
  };

  const moduleId = toModuleIdentifier(normalizedName);
  const source = `import type { LifeOSModule } from '@lifeos/module-loader';

export const ${moduleId}Module: LifeOSModule = {
  id: '${normalizedName}',
  async init(context) {
    await context.subscribe('lifeos.tick', async () => {
      context.log('[${normalizedName}] reacted to lifeos.tick');
    });
  },
};
`;

  const testSource = `import assert from 'node:assert/strict';
import test from 'node:test';

import type { LifeOSModule } from '@lifeos/module-loader';

import { ${moduleId}Module } from './index';

test('${normalizedName} exports a valid module shape', async () => {
  const moduleCandidate = ${moduleId}Module as LifeOSModule;
  assert.equal(moduleCandidate.id, '${normalizedName}');
  assert.equal(typeof moduleCandidate.init, 'function');
});
`;

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(modulePath, 'src', 'index.ts'), source, 'utf8');
  await writeFile(join(modulePath, 'src', 'index.test.ts'), testSource, 'utf8');

  return {
    moduleName: normalizedName,
    modulePath,
    manifestPath,
  };
}

export async function validateModuleManifest(
  moduleName: string,
  baseDir: string,
): Promise<ModuleValidateResult> {
  const normalizedName = moduleName.trim().toLowerCase();
  if (!MODULE_NAME_PATTERN.test(normalizedName)) {
    return {
      valid: false,
      manifestPath: resolve(baseDir, 'modules', normalizedName, 'lifeos.json'),
      errors: [
        'Module name must be kebab-case and use only lowercase letters, numbers, and hyphens.',
      ],
    };
  }

  const manifestPath = resolve(baseDir, 'modules', normalizedName, 'lifeos.json');
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      manifestPath,
      errors: [`Unable to read manifest: ${message}`],
    };
  }

  const errors = validateManifest(raw);
  return {
    valid: errors.length === 0,
    manifestPath,
    errors,
  };
}
