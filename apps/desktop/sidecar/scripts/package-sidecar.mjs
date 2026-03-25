import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sidecarRoot = resolve(scriptDir, '..');
const binariesDir = resolve(sidecarRoot, '../src-tauri/binaries');
const baseBinaryPath = resolve(binariesDir, 'lifeos-sidecar');

const TARGETS = {
  windows: {
    pkgTarget: 'node18-win-x64',
    tauriTriple: 'x86_64-pc-windows-msvc',
    extension: '.exe',
  },
  linux: {
    pkgTarget: 'node18-linux-x64',
    tauriTriple: 'x86_64-unknown-linux-gnu',
    extension: '',
  },
  macosX64: {
    pkgTarget: 'node18-macos-x64',
    tauriTriple: 'x86_64-apple-darwin',
    extension: '',
  },
  macosArm64: {
    pkgTarget: 'node18-macos-arm64',
    tauriTriple: 'aarch64-apple-darwin',
    extension: '',
  },
};

function getDefaultTargetKeys() {
  if (process.platform === 'win32') {
    return ['windows'];
  }
  if (process.platform === 'darwin') {
    return ['macosArm64'];
  }
  return ['linux'];
}

function resolveRequestedTargetKeys() {
  const fromEnv = process.env.LIFEOS_SIDECAR_TARGETS;
  if (!fromEnv) {
    return getDefaultTargetKeys();
  }

  const keys = fromEnv
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return getDefaultTargetKeys();
  }

  const invalid = keys.filter((key) => !(key in TARGETS));
  if (invalid.length > 0) {
    throw new Error(`Unsupported LIFEOS_SIDECAR_TARGETS values: ${invalid.join(', ')}`);
  }

  return keys;
}

function buildOutputPath(targetKey) {
  const target = TARGETS[targetKey];
  return `${baseBinaryPath}-${target.tauriTriple}${target.extension}`;
}

function runPkg(outputPath, pkgTarget) {
  const args = `dist/index.js --target ${pkgTarget} --output "${outputPath}"`;

  try {
    execSync(`pnpm exec pkg ${args}`, {
      cwd: sidecarRoot,
      stdio: 'inherit',
      shell: true,
    });
    return;
  } catch {
    // Fall back to on-demand pkg resolution when workspace deps are not fully installed.
  }

  execSync(`pnpm dlx pkg@5.8.1 ${args}`, {
    cwd: sidecarRoot,
    stdio: 'inherit',
    shell: true,
  });
}

async function main() {
  const requestedTargets = resolveRequestedTargetKeys();
  await mkdir(binariesDir, { recursive: true });

  const outputs = [];
  for (const targetKey of requestedTargets) {
    const outputPath = buildOutputPath(targetKey);
    await rm(outputPath, { force: true });

    const target = TARGETS[targetKey];
    runPkg(outputPath, target.pkgTarget);

    outputs.push(outputPath);
  }

  const defaultOutput = outputs[0];
  if (defaultOutput) {
    await rm(baseBinaryPath, { force: true });
    await copyFile(defaultOutput, baseBinaryPath);

    if (process.platform === 'win32') {
      await rm(`${baseBinaryPath}.exe`, { force: true });
      await copyFile(defaultOutput, `${baseBinaryPath}.exe`);
    }
  }

  console.log(`Packaged sidecar binaries to ${join('..', 'src-tauri', 'binaries')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});