import { access, readdir, rm, writeFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { join } from 'node:path';

const MODULE_SOURCE_FILES = ['agent.ts', 'events.ts', 'schema.ts', 'module.config.ts', 'manifest.ts'];

async function buildModule(moduleName: string): Promise<number> {
  const moduleDir = `modules/${moduleName}`;
  const outDir = `${moduleDir}/dist`;

  const include: string[] = [];
  for (const file of MODULE_SOURCE_FILES) {
    try {
      await access(join(moduleDir, file), constants.F_OK);
      include.push(`${moduleDir}/${file}`);
    } catch {
      // file absent in this module, skip
    }
  }

  if (include.length === 0) {
    console.log(`  No source files found in ${moduleDir}, skipping.`);
    return 0;
  }

  await rm(outDir, { recursive: true, force: true });

  const tmpConfig = JSON.stringify(
    {
      extends: './tsconfig.modules.json',
      compilerOptions: {
        outDir,
        rootDir: moduleDir,
        paths: {
          '@lifeos/*': ['packages/*/dist/index.d.ts'],
        },
      },
      include,
    },
    null,
    2,
  );
  const tmpPath = `tsconfig.modules.${moduleName}.tmp.json`;
  await writeFile(tmpPath, tmpConfig, 'utf8');

  try {
    const result = spawnSync('tsc', ['--project', tmpPath], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    if (result.error) throw result.error;

    return typeof result.status === 'number' ? result.status : 1;
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  // Bootstrap behavior: no modules directory means nothing to build yet.
  try {
    await access('modules', constants.F_OK);
  } catch {
    console.log('No modules directory found. Skipping module build.');
    return;
  }

  const entries = await readdir('modules', { withFileTypes: true });
  const moduleNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (moduleNames.length === 0) {
    console.log('No module directories found. Skipping module build.');
    return;
  }

  let exitCode = 0;
  for (const name of moduleNames) {
    console.log(`Building module: ${name}`);
    const code = await buildModule(name);
    if (code !== 0) exitCode = code;
  }

  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error('Failed to run module build bootstrap script.');
  console.error(error);
  process.exitCode = 1;
});
