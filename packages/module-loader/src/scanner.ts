import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ModuleManifest, ScanResult } from './types';

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

export async function scanModulesWithErrors(modulesDir: string): Promise<ScanResult[]> {
  const dirEntries = await readdir(modulesDir, { withFileTypes: true });
  const manifests: ScanResult[] = [];

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = resolve(modulesDir, entry.name, 'dist', 'manifest.js');
    try {
      await access(manifestPath);
    } catch {
      manifests.push({
        kind: 'error',
        moduleName: entry.name,
        message: 'Module not precompiled — run pnpm run build:modules',
      });
      continue;
    }

    let imported;
    try {
      imported = await import(pathToFileURL(manifestPath).href);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading manifest';
      manifests.push({
        kind: 'error',
        moduleName: entry.name,
        message: `Failed to load manifest: ${message}`,
      });
      continue;
    }

    const candidate = (imported.default ?? imported.manifest ?? imported) as unknown;

    if (!isModuleManifest(candidate)) {
      manifests.push({
        kind: 'error',
        moduleName: entry.name,
        message: `Invalid manifest shape in ${manifestPath}`,
      });
      continue;
    }

    manifests.push({
      kind: 'ok',
      manifest: candidate,
    });
  }

  return manifests;
}

export async function scanModules(modulesDir: string): Promise<ModuleManifest[]> {
  const results = await scanModulesWithErrors(modulesDir);
  return results
    .filter((result): result is { kind: 'ok'; manifest: ModuleManifest } => result.kind === 'ok')
    .map((result) => result.manifest);
}
