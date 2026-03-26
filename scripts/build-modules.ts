import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

async function discoverModuleTypeScriptFiles(modulePath: string): Promise<string[]> {
  const typeScriptFiles: string[] = [];

  async function walkDirectory(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relPath = relative(process.cwd(), fullPath);

      // Skip dist directory and node_modules
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        typeScriptFiles.push(relPath);
      }
    }
  }

  await walkDirectory(modulePath);
  return typeScriptFiles;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function buildModule(moduleName: string): Promise<number> {
  const moduleDir = `modules/${moduleName}`;
  const outDir = `${moduleDir}/dist`;
  const tsconfigPath = join(moduleDir, 'tsconfig.json');

  // Discover all TypeScript files in the module (excluding dist and generated artifacts)
  let include: string[] = [];
  try {
    include = await discoverModuleTypeScriptFiles(moduleDir);
  } catch (error) {
    console.error(`  Error discovering TypeScript files in ${moduleDir}:`, error);
    return 1;
  }

  if (include.length === 0) {
    console.log(`  No TypeScript source files found in ${moduleDir}, skipping.`);
    return 0;
  }

  await rm(outDir, { recursive: true, force: true });

  if (await pathExists(tsconfigPath)) {
    const result = spawnSync('pnpm', ['exec', 'tsc', '--build', tsconfigPath, '--force'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.error) {
      console.error(`  Failed to compile ${moduleDir}:`, result.error);
      return 1;
    }
    return typeof result.status === 'number' ? result.status : 1;
  }

  try {
    for (const sourcePath of include) {
      const source = await readFile(sourcePath, 'utf8');
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          sourceMap: true,
          inlineSources: true,
        },
        fileName: sourcePath,
        reportDiagnostics: true,
      });

      if (transpiled.diagnostics?.length) {
        const message = ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
          getCurrentDirectory: () => process.cwd(),
          getCanonicalFileName: (fileName) => fileName,
          getNewLine: () => '\n',
        });
        console.error(message);
        return 1;
      }

      const relativePath = relative(moduleDir, sourcePath).replace(/\.ts$/, '.js');
      const outputPath = join(outDir, relativePath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, transpiled.outputText, 'utf8');
      if (transpiled.sourceMapText) {
        await writeFile(`${outputPath}.map`, transpiled.sourceMapText, 'utf8');
      }
    }

    return 0;
  } catch (error) {
    console.error(`  Failed to compile ${moduleDir}:`, error);
    return 1;
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
