import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

type StageResult = {
  stdout: string;
  stderr: string;
  status: number;
};

type StageContext = {
  stageName: string;
  command: string;
};

const tempDir = join(process.env['RUNNER_TEMP'] ?? '.tmp', 'lifeos-cli-smoke');
const graphPath = join(tempDir, 'life-graph.json');

mkdirSync(tempDir, { recursive: true });

function formatArgs(args: string[]): string {
  return args
    .map((arg) => (/[\s"]/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    .join(' ');
}

function failStage(
  context: StageContext,
  result: StageResult | SpawnSyncReturns<string> | null,
  details?: string,
): never {
  const status = result?.status ?? 1;
  const stdout = result?.stdout ?? '';
  const stderr = result?.stderr ?? '';

  process.stderr.write(`Stage failed: ${context.stageName}\n`);
  process.stderr.write(`Command: ${context.command}\n`);
  process.stderr.write(`Exit code: ${status}\n`);
  if (details) {
    process.stderr.write(`${details}\n`);
  }
  process.stderr.write(`stdout:\n${stdout}\n`);
  process.stderr.write(`stderr:\n${stderr}\n`);
  process.exit(1);
}

function runStage(stageName: string, command: string, args: string[]): StageResult {
  const fullCommand = `${command} lifeos ${formatArgs(args)}`;
  const result = spawnSync('pnpm', ['lifeos', ...args], {
    encoding: 'utf8',
    shell: true,
  });

  if (result.error || result.status !== 0) {
    failStage(
      { stageName, command: fullCommand },
      result,
      result.error ? `Spawn error: ${result.error.message}` : undefined,
    );
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function assertJson<T>(raw: string, context: StageContext, result: StageResult): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failStage(context, result, `JSON parse error: ${message}`);
  }
}

function assertStage(condition: unknown, context: StageContext, result: StageResult, message: string): void {
  if (!condition) {
    failStage(context, result, `Assertion failed: ${message}`);
  }
}

const captureArgs = [
  'capture',
  'Phase 12 smoke capture',
  '--json',
  '--graph-path',
  graphPath,
];
const captureContext = {
  stageName: 'capture',
  command: `pnpm lifeos ${formatArgs(captureArgs)}`,
};
const captureRun = runStage('capture', 'pnpm', captureArgs);
const captureJson = assertJson<{ id?: unknown; status?: unknown }>(
  captureRun.stdout,
  captureContext,
  captureRun,
);
assertStage(
  typeof captureJson.id === 'string',
  captureContext,
  captureRun,
  'Expected id to be a string',
);
assertStage(
  captureJson.status === 'pending',
  captureContext,
  captureRun,
  'Expected status to be "pending"',
);
const captureId = captureJson.id as string;

const triageArgs = [
  'inbox',
  'triage',
  captureId,
  '--action',
  'task',
  '--due',
  '2030-04-05',
  '--json',
  '--graph-path',
  graphPath,
];
const triageContext = {
  stageName: 'inbox triage',
  command: `pnpm lifeos ${formatArgs(triageArgs)}`,
};
const triageRun = runStage('inbox triage', 'pnpm', triageArgs);
const triageJson = assertJson<{
  captureEntry?: { status?: unknown };
  plannedAction?: { id?: unknown; title?: unknown };
}>(triageRun.stdout, triageContext, triageRun);
assertStage(
  triageJson.captureEntry?.status === 'triaged',
  triageContext,
  triageRun,
  'Expected captureEntry.status to be "triaged"',
);
assertStage(
  typeof triageJson.plannedAction?.id === 'string',
  triageContext,
  triageRun,
  'Expected plannedAction.id to be a string',
);
const actionId = triageJson.plannedAction!.id as string;
const actionTitle =
  typeof triageJson.plannedAction?.title === 'string'
    ? triageJson.plannedAction.title
    : 'Phase 12 smoke capture';

const remindArgs = [
  'remind',
  actionId,
  '--at',
  '2030-04-04T09:00:00.000Z',
  '--json',
  '--graph-path',
  graphPath,
];
const remindContext = {
  stageName: 'remind',
  command: `pnpm lifeos ${formatArgs(remindArgs)}`,
};
const remindRun = runStage('remind', 'pnpm', remindArgs);
const remindJson = assertJson<{ id?: unknown; status?: unknown }>(
  remindRun.stdout,
  remindContext,
  remindRun,
);
assertStage(
  typeof remindJson.id === 'string',
  remindContext,
  remindRun,
  'Expected id to be a string',
);
assertStage(
  remindJson.status === 'scheduled',
  remindContext,
  remindRun,
  'Expected status to be "scheduled"',
);

const completeArgs = ['task', 'complete', actionId, '--json', '--graph-path', graphPath];
const completeContext = {
  stageName: 'task complete',
  command: `pnpm lifeos ${formatArgs(completeArgs)}`,
};
const completeRun = runStage('task complete', 'pnpm', completeArgs);
const completeJson = assertJson<{ id?: unknown; status?: unknown }>(
  completeRun.stdout,
  completeContext,
  completeRun,
);
assertStage(
  completeJson.id === actionId,
  completeContext,
  completeRun,
  'Expected id to equal actionId',
);
assertStage(
  completeJson.status === 'done',
  completeContext,
  completeRun,
  'Expected status to be "done"',
);

const reviewArgs = ['review', '--period', 'daily', '--json', '--graph-path', graphPath];
const reviewContext = {
  stageName: 'review',
  command: `pnpm lifeos ${formatArgs(reviewArgs)}`,
};
const reviewRun = runStage('review', 'pnpm', reviewArgs);
const reviewJson = assertJson<{
  period?: unknown;
  loopSummary?: { completedActions?: unknown };
}>(reviewRun.stdout, reviewContext, reviewRun);
assertStage(
  reviewJson.period === 'daily',
  reviewContext,
  reviewRun,
  'Expected period to be "daily"',
);
assertStage(
  Boolean(reviewJson.loopSummary),
  reviewContext,
  reviewRun,
  'Expected loopSummary to exist',
);

const completedActions = reviewJson.loopSummary?.completedActions;
const includesAction = Array.isArray(completedActions)
  ? completedActions.some((entry) => {
      if (typeof entry === 'string') {
        return entry.includes(actionId) || entry.includes(actionTitle);
      }
      if (entry && typeof entry === 'object') {
        const id = (entry as { id?: unknown }).id;
        const title = (entry as { title?: unknown }).title;
        return id === actionId || title === actionTitle;
      }
      return false;
    })
  : false;

assertStage(
  includesAction,
  reviewContext,
  reviewRun,
  'Expected loopSummary.completedActions to include actionId or action title',
);

process.stdout.write('CLI hero loop smoke: all 5 stages passed\n');
process.exit(0);