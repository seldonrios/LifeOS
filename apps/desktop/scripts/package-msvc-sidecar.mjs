import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, '..');
const packageScriptPath = resolve(desktopRoot, 'sidecar/scripts/package-sidecar.mjs');

const result = spawnSync(process.execPath, [packageScriptPath], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    LIFEOS_SIDECAR_TARGETS: 'windows',
  },
});

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
