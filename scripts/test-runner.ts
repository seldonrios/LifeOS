import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

interface PackageJson {
  name?: string;
  scripts?: { test?: string };
}

const violations: string[] = [];

for (const tier of ['packages', 'modules', 'services']) {
  const rootDir = join(process.cwd(), tier);
  const dirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const pkg of dirs) {
    const pkgDir = join(rootDir, pkg);
    const pkgJsonPath = join(pkgDir, 'package.json');

    if (!existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as PackageJson;
    const srcDir = join(pkgDir, 'src');

    if (!existsSync(srcDir)) continue;

    const allFiles = readdirSync(srcDir, { recursive: true, encoding: 'utf8' });
    const hasTestFiles = (allFiles as string[]).some(
      (f) =>
        f.endsWith('.test.ts') ||
        f.endsWith('.spec.ts') ||
        f.endsWith('.test.tsx') ||
        f.endsWith('.spec.tsx'),
    );

    if (hasTestFiles && !pkgJson.scripts?.test) {
      violations.push(
        `${pkgJson.name ?? pkg}: contains test files but is missing "scripts.test"`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Enforcement failed - these packages have test files but no "test" script:');
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  [
    '-r',
    '--filter',
    './packages/*',
    '--filter',
    './modules/*',
    '--filter',
    './services/*',
    'run',
    '--if-present',
    'test',
  ],
  { stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 0);
