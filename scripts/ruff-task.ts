import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

type Mode = 'check' | 'format' | 'format-check';

function hasPythonFiles(dir: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (hasPythonFiles(fullPath)) {
        return true;
      }
      continue;
    }

    if (entry.endsWith('.py')) {
      return true;
    }
  }

  return false;
}

function runRuff(args: string[]): number {
  const result = spawnSync('ruff', args, { stdio: 'inherit' });

  if (result.error) {
    console.error('Ruff CLI is required when Python files exist under packages/.');
    console.error('Install Ruff (for example: `uv tool install ruff`), then retry.');
    return 1;
  }

  return result.status ?? 1;
}

function main(): number {
  const mode = process.argv[2] as Mode | undefined;

  if (!mode || !['check', 'format', 'format-check'].includes(mode)) {
    console.error('Usage: tsx scripts/ruff-task.ts <check|format|format-check>');
    return 1;
  }

  if (!hasPythonFiles('packages')) {
    console.log('No Python files found under packages/. Skipping Ruff.');
    return 0;
  }

  if (mode === 'check') {
    return runRuff(['check', 'packages/']);
  }

  if (mode === 'format') {
    return runRuff(['format', 'packages/']);
  }

  return runRuff(['format', '--check', 'packages/']);
}

process.exit(main());
