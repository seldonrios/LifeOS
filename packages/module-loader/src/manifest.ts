import { readFile } from 'node:fs/promises';

export interface LifeOSManifestPermissions {
  graph: string[];
  network: string[];
  voice: string[];
  events: string[];
}

export interface LifeOSModuleManifest {
  name: string;
  version: string;
  author: string;
  description?: string;
  permissions: LifeOSManifestPermissions;
  requires: string[];
  category: string;
  tags: string[];
}

export interface LifeOSManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: LifeOSModuleManifest;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PACKAGE_NAME_PATTERN = /^@lifeos\/[a-z0-9-]+$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizePermissions(value: unknown): LifeOSManifestPermissions {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    graph: toStringArray(record.graph),
    network: toStringArray(record.network),
    voice: toStringArray(record.voice),
    events: toStringArray(record.events),
  };
}

function buildManifestCandidate(raw: unknown): LifeOSModuleManifest {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const description = getString(record.description);
  return {
    name: getString(record.name) ?? '',
    version: getString(record.version) ?? '',
    author: getString(record.author) ?? '',
    ...(description ? { description } : {}),
    permissions: normalizePermissions(record.permissions),
    requires: toStringArray(record.requires),
    category: getString(record.category) ?? '',
    tags: toStringArray(record.tags),
  };
}

export function validateLifeOSManifest(raw: unknown): LifeOSManifestValidationResult {
  const manifest = buildManifestCandidate(raw);
  const errors: string[] = [];

  if (!NAME_PATTERN.test(manifest.name)) {
    errors.push(
      'manifest.name must be kebab-case (letters, numbers, hyphens) and 2-63 characters.',
    );
  }
  if (!SEMVER_PATTERN.test(manifest.version)) {
    errors.push('manifest.version must be semver, e.g. "0.1.0".');
  }
  if (!getString(manifest.author)) {
    errors.push('manifest.author is required.');
  }
  if (!CATEGORY_PATTERN.test(manifest.category)) {
    errors.push('manifest.category must be kebab-case and 2-41 characters.');
  }

  for (const requiredPackage of manifest.requires) {
    if (!PACKAGE_NAME_PATTERN.test(requiredPackage)) {
      errors.push(
        `manifest.requires entry "${requiredPackage}" must look like "@lifeos/<package>".`,
      );
    }
  }

  for (const tag of manifest.tags) {
    if (!TAG_PATTERN.test(tag)) {
      errors.push(`manifest.tags entry "${tag}" is invalid. Use lowercase kebab-case tags.`);
    }
  }

  if (
    manifest.permissions.graph.length === 0 &&
    manifest.permissions.network.length === 0 &&
    manifest.permissions.voice.length === 0 &&
    manifest.permissions.events.length === 0
  ) {
    errors.push('manifest.permissions must declare at least one permission.');
  }

  if (
    manifest.permissions.events.some(
      (entry) => !/^(subscribe|publish):[A-Za-z0-9.*>_-]+(?:\.[A-Za-z0-9.*>_-]+)*$/.test(entry),
    )
  ) {
    errors.push(
      'manifest.permissions.events entries must use "subscribe:<topic>" or "publish:<topic>".',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { manifest } : {}),
  };
}

export async function readLifeOSManifestFile(
  path: string,
): Promise<LifeOSManifestValidationResult> {
  let raw: unknown;
  try {
    const contents = await readFile(path, 'utf8');
    raw = JSON.parse(contents) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [`Unable to read or parse manifest at ${path}: ${message}`],
    };
  }

  return validateLifeOSManifest(raw);
}
