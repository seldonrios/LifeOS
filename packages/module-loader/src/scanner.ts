import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ModuleManifest } from './types';

function isCapabilityLike(value: unknown): boolean {
  if (typeof value === 'string') {
    return true;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as { capability?: unknown }).capability === 'string';
}

function isDependencyLike(value: unknown): boolean {
  if (typeof value === 'string') {
    return true;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as { capability?: unknown }).capability === 'string';
}

function isModuleManifest(value: unknown): value is ModuleManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manifest = value as Partial<ModuleManifest>;

  return (
    typeof manifest.id === 'string' &&
    typeof manifest.name === 'string' &&
    typeof manifest.version === 'string' &&
    Array.isArray(manifest.provides) &&
    manifest.provides.every(isCapabilityLike) &&
    Array.isArray(manifest.requires) &&
    manifest.requires.every(isDependencyLike) &&
    Array.isArray(manifest.optional) &&
    manifest.optional.every(isDependencyLike)
  );
}

export async function scanModules(modulesDir: string): Promise<ModuleManifest[]> {
  const dirEntries = await readdir(modulesDir, { withFileTypes: true });
  const manifests: ModuleManifest[] = [];

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = resolve(modulesDir, entry.name, 'manifest.ts');
    try {
      await access(manifestPath);
    } catch {
      console.warn(`Skipping module '${entry.name}': manifest.ts not found.`);
      continue;
    }

    const imported = await import(pathToFileURL(manifestPath).href);
    const candidate = (imported.default ?? imported.manifest ?? imported) as unknown;

    if (!isModuleManifest(candidate)) {
      throw new Error(`Invalid module manifest in ${manifestPath}.`);
    }

    manifests.push(candidate);
  }

  return manifests;
}
