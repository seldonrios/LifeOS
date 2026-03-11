import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

async function main(): Promise<void> {
  // Bootstrap behavior: no modules directory means nothing to build yet.
  try {
    await access('modules', constants.F_OK);
  } catch {
    console.log('No modules directory found. Skipping module build.');
    return;
  }

  const result = spawnSync('tsc', ['--project', 'tsconfig.modules.json'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return;
  }

  if (result.error) {
    throw result.error;
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Failed to run module build bootstrap script.');
  console.error(error);
  process.exitCode = 1;
});
