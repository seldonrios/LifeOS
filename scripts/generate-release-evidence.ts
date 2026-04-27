import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function main(): Promise<void> {
  const sha = process.env.LIFEOS_CI_SHA ?? 'local';
  const ref = process.env.LIFEOS_CI_REF ?? 'local';
  const workflow = process.env.LIFEOS_CI_WORKFLOW ?? 'local';
  const runId = process.env.LIFEOS_CI_RUN_ID ?? 'unknown';
  const os = process.env.LIFEOS_CI_OS ?? 'unknown';
  const node = process.env.LIFEOS_CI_NODE ?? 'unknown';

  const outputDir = join('.artifacts', 'release-evidence');
  const outputPath = join(outputDir, 'release-evidence.json');

  await mkdir(outputDir, { recursive: true });

  const evidence = {
    generatedAt: new Date().toISOString(),
    commit: {
      sha,
      ref,
      workflow,
      runId,
    },
    environment: {
      os,
      node,
      packageManager: 'pnpm@9.15.4',
    },
    validationCommands: [
      'pnpm run validate',
      'pnpm test:core-loop',
      'pnpm --filter @lifeos/cli exec tsx --test src/hero-loop.integration.test.ts',
    ],
    artifacts: {
      coverage: `coverage-${os}-node${node}`,
      releaseEvidence: `release-evidence-${os}-node${node}`,
      coreLoopLogs: 'core-loop-logs',
    },
    thresholds: {
      services: {
        dashboard: {
          lines: 50,
        },
        homeNode: {
          lines: 50,
        },
      },
      sdk: {
        lines: 60,
      },
    },
    heroLoop: {
      coreLoopScript: 'scripts/test-core-loop.ts',
      cliSmokeScript: 'scripts/cli-smoke-hero-loop.ts',
    },
  };

  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `Release evidence written: .artifacts/release-evidence/release-evidence.json (os: ${os}, node: ${node}, sha: ${sha})\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`Release evidence generation failed: ${message}\n`);
  process.exit(0);
});