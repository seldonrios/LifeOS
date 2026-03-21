import {
  appendGoalPlanRecord,
  getDefaultLifeGraphPath,
  type AppendGoalPlanRecordInput,
  type GoalPlanRecord,
} from '@lifeos/life-graph';
import type { GoalInterpretationPlan } from '@lifeos/goal-engine';
import { pathToFileURL } from 'node:url';

import { formatGoalPlan } from './format';
import { interpretGoal } from './goal-interpreter';

const DEFAULT_MODEL = 'llama3.1:8b';

interface ParsedGoalArgs {
  input: string;
  model: string;
  outputJson: boolean;
  save: boolean;
  graphPath: string;
}

export interface RunCliDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  cwd?: () => string;
  interpretGoal?: (
    input: string,
    options: { model: string; host?: string; now: Date },
  ) => Promise<GoalInterpretationPlan>;
  appendGoalPlanRecord?: (
    entry: AppendGoalPlanRecordInput<GoalInterpretationPlan>,
    graphPath?: string,
  ) => Promise<GoalPlanRecord<GoalInterpretationPlan>>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

function usage(): string {
  return [
    'Usage:',
    '  lifeos goal "<natural language goal>" [--json] [--no-save] [--model <name>] [--graph-path <path>]',
    '',
    'Flags:',
    '  --json              Output normalized JSON only',
    '  --no-save           Skip writing to local life graph',
    '  --model <name>      Override model (default: llama3.1:8b or LIFEOS_GOAL_MODEL)',
    '  --graph-path <path> Override graph path (default: <repo>/.lifeos/life-graph.json)',
  ].join('\n');
}

function parseGoalArgs(args: string[], env: NodeJS.ProcessEnv, baseDir: string): ParsedGoalArgs {
  let outputJson = false;
  let save = true;
  let model = env.LIFEOS_GOAL_MODEL?.trim() || DEFAULT_MODEL;
  let graphPath = getDefaultLifeGraphPath(baseDir);
  const inputParts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--json') {
      outputJson = true;
      continue;
    }

    if (arg === '--no-save') {
      save = false;
      continue;
    }

    if (arg === '--model') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--model requires a value.');
      }
      model = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--graph-path') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--graph-path requires a value.');
      }
      graphPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--graph-path=')) {
      graphPath = arg.slice('--graph-path='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    inputParts.push(arg);
  }

  const input = inputParts.join(' ').trim();
  if (!input) {
    throw new Error('Goal input is required.');
  }

  return { input, model, outputJson, save, graphPath };
}

export async function runCli(
  argv: string[],
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const cwd = dependencies.cwd ?? process.cwd;
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const interpret = dependencies.interpretGoal ?? interpretGoal;
  const appendRecord = dependencies.appendGoalPlanRecord ?? appendGoalPlanRecord;

  if (argv[0] !== 'goal') {
    writeStderr(`${usage()}\n`);
    return 1;
  }

  let parsedArgs: ParsedGoalArgs;
  try {
    parsedArgs = parseGoalArgs(argv.slice(1), env, cwd());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid CLI arguments.';
    writeStderr(`Error: ${message}\n`);
    writeStderr(`${usage()}\n`);
    return 1;
  }

  try {
    const interpretOptions: { model: string; host?: string; now: Date } = {
      model: parsedArgs.model,
      now: now(),
    };
    if (env.OLLAMA_HOST) {
      interpretOptions.host = env.OLLAMA_HOST;
    }

    const plan = await interpret(parsedArgs.input, interpretOptions);

    if (parsedArgs.outputJson) {
      writeStdout(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      writeStdout(`Planning: ${parsedArgs.input}\n\n`);
      writeStdout(`${formatGoalPlan(plan)}\n`);
    }

    if (parsedArgs.save) {
      const saved = await appendRecord(
        {
          input: parsedArgs.input,
          plan,
        },
        parsedArgs.graphPath,
      );

      if (!parsedArgs.outputJson) {
        writeStdout(`\nSaved to ${parsedArgs.graphPath} (id: ${saved.id}).\n`);
      }
    }

    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    writeStderr(`Error: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  void main();
}
