#!/usr/bin/env node
import boxen from 'boxen';
import chalk from 'chalk';
import { Command, CommanderError } from 'commander';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ora, { type Ora } from 'ora';

import { GoalPlanParseError, type GoalInterpretationPlan } from '@lifeos/goal-engine';
import {
  appendGoalPlan,
  getDefaultLifeGraphPath,
  getGraphSummary,
  loadGraph,
  type GoalPlanRecord,
  type LifeGraphDocument,
  type LifeGraphSummary,
} from '@lifeos/life-graph';
import { formatGoalPlan } from './format';
import { interpretGoal, type InterpretGoalStage } from './goal-interpreter';

const DEFAULT_MODEL = 'llama3.1:8b';
const CLI_VERSION = '0.1.0';

interface GoalCommandOptions {
  outputJson: boolean;
  save: boolean;
  model: string;
  graphPath: string;
  verbose: boolean;
}

interface StatusCommandOptions {
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

interface SpinnerLike {
  start(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  stop(): SpinnerLike;
}

export interface RunCliDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  cwd?: () => string;
  interpretGoal?: (
    input: string,
    options: {
      model: string;
      host?: string;
      now: Date;
      onStage?: (stage: InterpretGoalStage) => void;
    },
  ) => Promise<GoalInterpretationPlan>;
  appendGoalPlan?: (
    entry: {
      input: string;
      plan: GoalInterpretationPlan;
      id?: string;
      createdAt?: string;
    },
    graphPath?: string,
  ) => Promise<GoalPlanRecord<GoalInterpretationPlan>>;
  loadGraph?: (graphPath?: string) => Promise<LifeGraphDocument>;
  getGraphSummary?: (graphPath?: string) => Promise<LifeGraphSummary>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  fileExists?: (path: string) => boolean;
  createSpinner?: (text: string) => SpinnerLike;
}

interface FriendlyCliError {
  message: string;
  guidance?: string;
}

function resolveBaseCwd(env: NodeJS.ProcessEnv, cwdProvider?: () => string): string {
  if (cwdProvider) {
    return cwdProvider();
  }

  return env.INIT_CWD?.trim() || process.cwd();
}

function createDefaultSpinner(text: string): SpinnerLike {
  return ora({
    text,
    color: 'blue',
  }) as Ora;
}

function mapStageToVerboseLine(stage: InterpretGoalStage): string {
  const stageLines: Record<InterpretGoalStage, string> = {
    prompt_built: 'prompt assembled',
    llm_request_started: 'sending request to local model',
    llm_response_received: 'model response received',
    plan_parse_started: 'validating response against MVP schema',
    plan_parse_succeeded: 'response validated and parsed',
    repair_prompt_built: 'building repair prompt after schema mismatch',
    repair_request_started: 'sending repair request to local model',
    repair_response_received: 'repair response received',
    repair_parse_started: 'validating repaired response against MVP schema',
    repair_parse_succeeded: 'repaired response validated and parsed',
  };

  return stageLines[stage];
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error.';
}

function toFriendlyCliError(error: unknown, model: string): FriendlyCliError {
  const message = normalizeErrorMessage(error);

  if (
    /fetch failed|econnrefused|enotfound|connect econn|network error|connection refused/i.test(
      message,
    )
  ) {
    return {
      message: 'Ollama is not reachable.',
      guidance: ['Quick fix:', '  ollama serve', `  ollama pull ${model}`].join('\n'),
    };
  }

  if (/model.+not found|try pulling/i.test(message)) {
    return {
      message: `Model "${model}" is not available in Ollama.`,
      guidance: `Run:\n  ollama pull ${model}`,
    };
  }

  if (error instanceof GoalPlanParseError || /not a valid mvp goal plan/i.test(message)) {
    return {
      message: 'Model output did not match the expected goal-plan schema.',
      guidance:
        'Try re-running with a clearer goal statement. Use --verbose to inspect safe parse diagnostics.',
    };
  }

  return { message };
}

function formatStatusSummary(summary: LifeGraphSummary): string {
  const lines: string[] = [];
  lines.push(`Version: ${summary.version}`);
  lines.push(`Total Plans: ${summary.totalPlans}`);
  lines.push(`Updated At: ${summary.updatedAt}`);
  lines.push(`Latest Plan: ${summary.latestPlanCreatedAt ?? 'none'}`);
  lines.push(
    `Recent Titles: ${
      summary.recentPlanTitles.length > 0 ? summary.recentPlanTitles.join(' | ') : 'none'
    }`,
  );
  return lines.join('\n');
}

export async function runGoalCommand(
  goal: string,
  options: GoalCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const appendPlan = dependencies.appendGoalPlan ?? appendGoalPlan;
  const interpret = dependencies.interpretGoal ?? interpretGoal;
  const fileExists = dependencies.fileExists ?? existsSync;
  const createSpinner = dependencies.createSpinner ?? createDefaultSpinner;

  const normalizedGoal = goal.trim();
  if (!normalizedGoal) {
    writeStderr(`${chalk.red.bold('Error:')} Goal input is required.\n`);
    return 1;
  }

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  const host = env.OLLAMA_HOST;
  const startedAt = Date.now();
  verboseLog(`model=${options.model}`);
  verboseLog(`ollama_host=${host ?? 'http://127.0.0.1:11434 (default)'}`);
  verboseLog(`graph_path=${options.graphPath}`);

  const spinner =
    options.outputJson === false
      ? createSpinner(chalk.blue('Thinking about your goal...')).start()
      : null;

  try {
    const interpretOptions: {
      model: string;
      host?: string;
      now: Date;
      onStage?: (stage: InterpretGoalStage) => void;
    } = {
      model: options.model,
      now: now(),
    };
    if (host) {
      interpretOptions.host = host;
    }
    if (options.verbose) {
      interpretOptions.onStage = (stage: InterpretGoalStage) => {
        verboseLog(`stage=${mapStageToVerboseLine(stage)}`);
      };
    }
    const plan = await interpret(normalizedGoal, interpretOptions);

    spinner?.succeed(chalk.green('Goal decomposed successfully.'));

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      writeStdout(`${chalk.bold('Plan for:')} ${chalk.cyan(normalizedGoal)}\n`);
      writeStdout(`${chalk.dim('-'.repeat(60))}\n`);
      writeStdout(`${formatGoalPlan(plan)}\n`);
    }

    if (options.save) {
      const defaultGraphPath = getDefaultLifeGraphPath({ baseDir: baseCwd, env });
      const isFirstRun = options.graphPath === defaultGraphPath && !fileExists(options.graphPath);
      if (isFirstRun) {
        const firstRunMessage = `Welcome to LifeOS! Initializing your personal graph at ${options.graphPath}`;
        if (options.outputJson) {
          writeStderr(`${chalk.yellow(firstRunMessage)}\n`);
        } else {
          writeStdout(`${chalk.yellow(firstRunMessage)}\n`);
        }
      }

      verboseLog('stage=save_started');
      const saved = await appendPlan(
        {
          input: normalizedGoal,
          plan,
        },
        options.graphPath,
      );
      verboseLog('stage=save_completed');
      verboseLog(`saved_record_id=${saved.id}`);

      if (options.outputJson === false) {
        writeStdout(`${chalk.green(`[saved] ${options.graphPath} (id: ${saved.id})`)}\n`);
      }
    }

    if (options.outputJson === false) {
      writeStdout(
        `${boxen(chalk.green('Goal planned successfully.'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })}\n`,
      );
    }

    verboseLog(`duration_ms=${Date.now() - startedAt}`);
    return 0;
  } catch (error: unknown) {
    spinner?.fail(chalk.red('Failed to process goal.'));
    const friendly = toFriendlyCliError(error, options.model);
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
    }
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  } finally {
    spinner?.stop();
  }
}

export async function runStatusCommand(
  options: StatusCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const load = dependencies.loadGraph ?? loadGraph;
  const summarize = dependencies.getGraphSummary ?? getGraphSummary;

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  verboseLog(`graph_path=${options.graphPath}`);

  try {
    if (options.outputJson) {
      verboseLog('stage=graph_load_started');
      const graph = await load(options.graphPath);
      verboseLog('stage=graph_load_completed');
      writeStdout(`${JSON.stringify(graph, null, 2)}\n`);
      return 0;
    }

    verboseLog('stage=summary_load_started');
    const summary = await summarize(options.graphPath);
    verboseLog('stage=summary_load_completed');

    writeStdout(`${chalk.bold('Life Graph Status')}\n`);
    writeStdout(`${chalk.dim('-'.repeat(60))}\n`);
    writeStdout(`${formatStatusSummary(summary)}\n`);
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  }
}

function buildProgram(
  dependencies: RunCliDependencies,
  setExitCode: (exitCode: number) => void,
): Command {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  const defaultModel = env.LIFEOS_GOAL_MODEL?.trim() || DEFAULT_MODEL;
  const defaultGraphPath = getDefaultLifeGraphPath({ baseDir: baseCwd, env });

  const program = new Command();
  program.name('lifeos').description('Sovereign Personal AI Node CLI').version(CLI_VERSION);
  program.configureOutput({
    writeOut: writeStdout,
    writeErr: writeStderr,
  });
  program.exitOverride();

  program
    .command('goal')
    .description('Decompose and plan a goal')
    .argument('<goal>', 'The goal description')
    .option('--json', 'Output normalized JSON only')
    .option('--no-save', 'Do not persist to local life graph')
    .option(
      '--model <model>',
      'Override model (default: llama3.1:8b or LIFEOS_GOAL_MODEL)',
      defaultModel,
    )
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (goal: string, commandOptions) => {
      const commandExitCode = await runGoalCommand(
        goal,
        {
          outputJson: Boolean(commandOptions.json),
          save: commandOptions.save !== false,
          model: commandOptions.model,
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );

      setExitCode(commandExitCode);
    });

  program
    .command('status')
    .description('Show current life graph summary')
    .option('--json', 'Output full life graph JSON')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runStatusCommand(
        {
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  return program;
}

export async function runCli(
  argv: string[],
  dependencies: RunCliDependencies = {},
): Promise<number> {
  let exitCode = 0;
  const program = buildProgram(dependencies, (code: number) => {
    exitCode = code;
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }

  return exitCode;
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
