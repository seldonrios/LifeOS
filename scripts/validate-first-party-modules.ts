import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getFirstPartyModuleCatalog } from '@lifeos/core';
import { validateLifeOSManifest } from '@lifeos/module-loader';

async function main(): Promise<void> {
  const baseDir = process.cwd();
  const catalog = getFirstPartyModuleCatalog();
  const uniqueEntries = Array.from(
    new Map(catalog.map((entry) => [entry.manifestDirectory, entry] as const)).values(),
  );

  const failures: Array<{ moduleId: string; manifestPath: string; errors: string[] }> = [];

  for (const entry of uniqueEntries) {
    const manifestPath = join(baseDir, 'modules', entry.manifestDirectory, 'lifeos.json');
    try {
      const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
      const result = validateLifeOSManifest(raw);
      if (!result.valid) {
        failures.push({
          moduleId: entry.canonicalId,
          manifestPath,
          errors: result.errors,
        });
        continue;
      }
      process.stdout.write(
        `OK ${entry.canonicalId} -> modules/${entry.manifestDirectory}/lifeos.json [tier=${entry.tier} visible=${entry.visibleInCli ? 'yes' : 'no'}]\n`,
      );
    } catch (error: unknown) {
      failures.push({
        moduleId: entry.canonicalId,
        manifestPath,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  if (failures.length === 0) {
    process.stdout.write(
      `Validated ${uniqueEntries.length} first-party manifest file(s) from the authoritative catalog.\n`,
    );
    return;
  }

  for (const failure of failures) {
    process.stderr.write(`FAIL ${failure.moduleId} -> ${failure.manifestPath}\n`);
    for (const error of failure.errors) {
      process.stderr.write(`- ${error}\n`);
    }
  }
  process.exitCode = 1;
}

void main();