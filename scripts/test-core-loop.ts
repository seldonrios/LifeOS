/**
 * Core Loop Integration Test
 *
 * Exercises the full hero loop in-process via runCli():
 *   capture → inbox triage → remind → task complete → review
 * Also asserts the failure mode (triage on a nonexistent capture entry).
 *
 * Usage: tsx scripts/test-core-loop.ts
 * Writes: logs/core-loop-test.json
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCli } from '../packages/cli/src/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageResult {
  name: string;
  passed: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runStage(
  name: string,
  fn: () => Promise<void>,
): Promise<StageResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (err: unknown) {
    return {
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function collectCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const exitCode = await runCli(argv, {
    env,
    stdout: (msg) => stdoutChunks.push(msg),
    stderr: (msg) => stderrChunks.push(msg),
  });

  return {
    exitCode,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const tmpDir = join('.tmp', 'core-loop-test');
  const graphPath = join(tmpDir, 'life-graph.json');
  const logsDir = 'logs';
  const logFile = join(logsDir, 'core-loop-test.json');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: tmpDir,
    USERPROFILE: tmpDir,
  };

  await mkdir(tmpDir, { recursive: true });

  const stages: StageResult[] = [];
  let captureId = '';
  let actionId = '';
  let actionTitle = '';

  try {
    // ------------------------------------------------------------------
    // Stage 1 – capture
    // ------------------------------------------------------------------
    stages.push(
      await runStage('capture', async () => {
        const { exitCode, stdout, stderr } = await collectCli(
          [
            'capture',
            'Plan team sync for Friday',
            '--json',
            '--graph-path',
            graphPath,
          ],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
        const result = JSON.parse(stdout) as {
          id?: string;
          status?: string;
          content?: string;
        };
        assert(typeof result.id === 'string' && result.id.length > 0, 'id must be present');
        assert(result.status === 'pending', `Expected status "pending", got "${result.status}"`);
        captureId = result.id as string;
      }),
    );

    // ------------------------------------------------------------------
    // Stage 1.5 – capture idempotency (immediate duplicate with same content)
    // ------------------------------------------------------------------
    stages.push(
      await runStage('capture idempotency', async () => {
        const { exitCode, stdout, stderr } = await collectCli(
          [
            'capture',
            'Plan team sync for Friday',
            '--json',
            '--graph-path',
            graphPath,
          ],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
        const result = JSON.parse(stdout) as {
          id?: string;
          status?: string;
          content?: string;
        };
        assert(typeof result.id === 'string' && result.id.length > 0, 'id must be present');
        assert(
          result.id === captureId,
          `Expected same id "${captureId}" on duplicate capture, got "${result.id}"`,
        );
        assert(result.status === 'pending', `Expected status "pending", got "${result.status}"`);
      }),
    );

    // ------------------------------------------------------------------
    // Stage 2 – inbox triage
    // ------------------------------------------------------------------
    stages.push(
      await runStage('inbox triage', async () => {
        const { exitCode, stdout, stderr } = await collectCli(
          [
            'inbox',
            'triage',
            captureId,
            '--action',
            'task',
            '--due',
            '2026-04-05',
            '--json',
            '--graph-path',
            graphPath,
          ],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr=${stderr}`);
        const result = JSON.parse(stdout) as {
          captureEntry?: { status?: string };
          plannedAction?: { id?: string; title?: string };
        };
        assert(
          result.captureEntry?.status === 'triaged',
          `Expected captureEntry.status "triaged", got "${result.captureEntry?.status}"`,
        );
        assert(
          typeof result.plannedAction?.id === 'string' && result.plannedAction.id.length > 0,
          'plannedAction.id must be present',
        );
        const plannedAction = result.plannedAction as { id: string; title?: string };
        actionId = plannedAction.id;
        actionTitle = plannedAction.title ?? '';
      }),
    );

    // ------------------------------------------------------------------
    // Stage 4 – remind
    // ------------------------------------------------------------------
    stages.push(
      await runStage('remind', async () => {
        const { exitCode, stdout, stderr } = await collectCli(
          [
            'remind',
            actionId,
            '--at',
            '2026-04-04T09:00:00Z',
            '--json',
            '--graph-path',
            graphPath,
          ],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr=${stderr}`);
        const result = JSON.parse(stdout) as { id?: string; status?: string };
        assert(
          result.status === 'scheduled',
          `Expected status "scheduled", got "${result.status}"`,
        );
        assert(typeof result.id === 'string' && result.id.length > 0, 'remind id must be present');

        const secondRemind = await collectCli(
          [
            'remind',
            actionId,
            '--at',
            '2026-04-04T09:00:00Z',
            '--json',
            '--graph-path',
            graphPath,
          ],
          env,
        );
        assert(
          secondRemind.exitCode === 0,
          `Expected idempotent remind exit 0, got ${secondRemind.exitCode}. stderr=${secondRemind.stderr}`,
        );
        const secondResult = JSON.parse(secondRemind.stdout) as { id?: string; status?: string };
        assert(
          secondResult.status === 'scheduled',
          `Expected idempotent remind status "scheduled", got "${secondResult.status}"`,
        );
        assert(
          secondResult.id === result.id,
          `Expected idempotent remind to return same id "${result.id}", got "${secondResult.id}"`,
        );
      }),
    );

    // ------------------------------------------------------------------
    // Stage 5 – task complete
    // ------------------------------------------------------------------
    stages.push(
      await runStage('task complete', async () => {
        const { exitCode, stdout, stderr } = await collectCli(
          ['task', 'complete', actionId, '--json', '--graph-path', graphPath],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}. stderr=${stderr}`);
        const result = JSON.parse(stdout) as { id?: string; status?: string };
        assert(result.id === actionId, `Expected id "${actionId}", got "${result.id}"`);
        assert(result.status === 'done', `Expected status "done", got "${result.status}"`);
      }),
    );

    // ------------------------------------------------------------------
    // Stage 6 – review
    // ------------------------------------------------------------------
    stages.push(
      await runStage('review', async () => {
        const { exitCode, stdout } = await collectCli(
          ['review', '--period', 'daily', '--json', '--graph-path', graphPath],
          env,
        );
        assert(exitCode === 0, `Expected exit 0, got ${exitCode}`);
        const result = JSON.parse(stdout) as {
          period?: string;
          wins?: unknown[];
          nextActions?: unknown[];
          history?: unknown[];
          loopSummary?: {
            pendingCaptures?: unknown;
            actionsDueToday?: unknown;
            unacknowledgedReminders?: unknown;
            completedActions?: unknown;
          };
        };
        assert(result.period === 'daily', `Expected period "daily", got "${result.period}"`);
        assert(Array.isArray(result.wins), 'wins must be an array');
        assert(Array.isArray(result.nextActions), 'nextActions must be an array');
        assert(typeof result.loopSummary === 'object' && result.loopSummary !== null, 'loopSummary must be present');
        assert(
          typeof result.loopSummary?.pendingCaptures === 'number',
          'loopSummary.pendingCaptures must be a number',
        );
        assert(
          typeof result.loopSummary?.actionsDueToday === 'number',
          'loopSummary.actionsDueToday must be a number',
        );
        assert(
          typeof result.loopSummary?.unacknowledgedReminders === 'number',
          'loopSummary.unacknowledgedReminders must be a number',
        );
        assert(
          Array.isArray(result.loopSummary?.completedActions),
          'loopSummary.completedActions must be an array',
        );
        const completedActions = Array.isArray(result.loopSummary?.completedActions)
          ? result.loopSummary.completedActions.filter(
              (item): item is string => typeof item === 'string',
            )
          : [];
        assert(completedActions.length >= 1, 'loopSummary.completedActions must include the completed action');
        assert(
          completedActions.some(
            (item) => item.includes(actionId) || (actionTitle.length > 0 && item.includes(actionTitle)),
          ),
          'loopSummary.completedActions must reference the completed planned action identity/title',
        );

        const nextActions = Array.isArray(result.nextActions)
          ? result.nextActions.filter((item): item is string => typeof item === 'string')
          : [];
        const history = Array.isArray(result.history)
          ? result.history.filter((item): item is string => typeof item === 'string')
          : [];

        const referencesCompletedAction = [...nextActions, ...history].some(
          (item) => item.includes(actionId) || (actionTitle.length > 0 && item.includes(actionTitle)),
        );
        assert(
          referencesCompletedAction,
          'Expected review output nextActions or history to include completed planned action identity/title',
        );
      }),
    );

    // ------------------------------------------------------------------
    // Stage 7 – failure mode (triage nonexistent capture)
    // ------------------------------------------------------------------
    stages.push(
      await runStage('failure mode (nonexistent capture)', async () => {
        const { exitCode, stderr } = await collectCli(
          ['inbox', 'triage', 'nonexistent-id', '--graph-path', graphPath],
          env,
        );
        assert(exitCode === 1, `Expected exit 1, got ${exitCode}`);
        assert(
          stderr.includes('ERR_CAPTURE_NOT_FOUND'),
          `Expected ERR_CAPTURE_NOT_FOUND in stderr, got: "${stderr}"`,
        );
      }),
    );
  } finally {
    // Write log regardless of outcome
    await mkdir(logsDir, { recursive: true });
    await writeFile(logFile, `${JSON.stringify({ stages }, null, 2)}\n`, 'utf8');

    // Cleanup temp dir (best effort on Windows where sqlite file handles can linger briefly)
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures to keep test result focused on loop behavior.
    }
  }

  // Summary
  const passed = stages.filter((s) => s.passed).length;
  const failed = stages.filter((s) => !s.passed).length;

  if (failed > 0) {
    process.stderr.write(`\nCore loop integration: ${passed}/${stages.length} stages passed\n`);
    for (const stage of stages.filter((s) => !s.passed)) {
      process.stderr.write(`  FAIL [${stage.name}]: ${stage.error ?? 'unknown error'}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `\nCore loop integration: all ${stages.length} stages passed. Log: ${logFile}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
