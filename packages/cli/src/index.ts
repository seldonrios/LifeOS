#!/usr/bin/env node
import { randomUUID } from 'node:crypto';

import boxen from 'boxen';
import chalk from 'chalk';
import { Command, CommanderError } from 'commander';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import ora, { type Ora } from 'ora';

import {
  Topics,
  createEventBusClient,
  type BaseEvent,
  type CreateEventBusClientOptions,
  type EventBusTransport,
  type ManagedEventBus,
} from '@lifeos/event-bus';
import {
  createLifeGraphClient,
  getDefaultLifeGraphPath,
  type GoalPlan,
  type GoalPlanRecord,
  type LifeGraphClient,
  type LifeGraphReviewInsights,
  type LifeGraphReviewPeriod,
  type LifeGraphSummary,
} from '@lifeos/life-graph';
import { createModuleLoader, type LifeOSModule, type ModuleLoader } from '@lifeos/module-loader';
import {
  interpretGoal,
  runTick,
  type InterpretGoalStage,
  type TickResult,
} from '@lifeos/goal-engine';
import { calendarModule } from '@lifeos/calendar-module';
import { newsModule } from '@lifeos/news-module';
import { notesModule } from '@lifeos/notes-module';
import { researchModule } from '@lifeos/research-module';
import { reminderModule } from '@lifeos/reminder-module';
import { schedulerModule } from '@lifeos/scheduler-module';
import { weatherModule } from '@lifeos/weather-module';
import {
  MissingMicrophoneConsentError,
  UnsupportedVoicePlatformError,
  consent,
  createVoiceCore,
  type IntentOutcome,
  type VoiceCoreOptions,
} from '@lifeos/voice-core';
import { formatGoalPlan } from './format';
import { printGraphSummary, printReviewInsights } from './printer';
import { handleNextActions, handleTaskComplete, handleTaskList } from './task-command';

const DEFAULT_MODEL = 'llama3.1:8b';
const CLI_VERSION = '0.1.0';
const DEFAULT_VOICE_PUBLISH_TIMEOUT_MS = 1500;
const DEFAULT_VOICE_CLOSE_TIMEOUT_MS = 3000;
const VOICE_DEMO_SCENARIOS = {
  task: 'Hey LifeOS, add a task to buy milk',
  calendar: 'Hey LifeOS, schedule dentist appointment next Tuesday at 10am',
  research: 'Hey LifeOS, research quantum computing breakthroughs this year',
  note: 'Hey LifeOS, note that the team prefers async updates',
  weather: 'Hey LifeOS, what is the weather in London this weekend?',
  news: 'Hey LifeOS, give me top tech news today',
} as const;

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

interface ReviewCommandOptions {
  outputJson: boolean;
  graphPath: string;
  period: LifeGraphReviewPeriod;
  verbose: boolean;
}

interface TaskCommandOptions {
  action: 'list' | 'complete' | 'next';
  taskId?: string;
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

interface TickCommandOptions {
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

interface DemoCommandOptions {
  goal: string;
  model: string;
  graphPath: string;
  verbose: boolean;
}

interface EventsListenCommandOptions {
  topic: string;
  outputJson: boolean;
  verbose: boolean;
}

interface ModulesCommandOptions {
  action: 'list' | 'load';
  moduleId?: string;
}

interface VoiceCommandOptions {
  mode: 'start' | 'demo' | 'consent' | 'calendar';
  text: string;
  scenario?: keyof typeof VOICE_DEMO_SCENARIOS;
  graphPath: string;
  verbose: boolean;
}

interface ResearchCommandOptions {
  query: string;
  graphPath: string;
  verbose: boolean;
}

interface SpinnerLike {
  start(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  stop(): SpinnerLike;
}

interface VoiceRuntimeController {
  start(): Promise<void>;
  runDemo(text: string): Promise<IntentOutcome | null>;
  close(): Promise<void>;
  getWakePhrase(): string;
}

type RuntimeEventHandler = (event: BaseEvent<unknown>) => Promise<void>;

function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) {
    return true;
  }

  const patternParts = pattern.split('.');
  const topicParts = topic.split('.');
  for (let index = 0; index < patternParts.length; index += 1) {
    const token = patternParts[index];
    if (token === '>') {
      return true;
    }
    const part = topicParts[index];
    if (!part) {
      return false;
    }
    if (token !== '*' && token !== part) {
      return false;
    }
  }
  return patternParts.length === topicParts.length;
}

class LocalRuntimeEventBus implements ManagedEventBus {
  private readonly handlers = new Map<string, Set<RuntimeEventHandler>>();

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    const callbacks: RuntimeEventHandler[] = [];
    this.handlers.forEach((set, pattern) => {
      if (!topicMatches(pattern, topic)) {
        return;
      }
      set.forEach((handler) => callbacks.push(handler));
    });

    for (const callback of callbacks) {
      await callback(event as BaseEvent<unknown>);
    }
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    const existing = this.handlers.get(topic) ?? new Set<RuntimeEventHandler>();
    existing.add(handler as RuntimeEventHandler);
    this.handlers.set(topic, existing);
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }

  getTransport(): EventBusTransport {
    return 'in-memory';
  }
}

function createLocalRuntimeEventBus(): ManagedEventBus {
  return new LocalRuntimeEventBus();
}

export interface RunCliDependencies {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  cwd?: () => string;
  interpretGoal?: (
    input: string,
    options: {
      model?: string;
      host?: string;
      now: Date;
      onStage?: (stage: InterpretGoalStage) => void;
    },
  ) => Promise<GoalPlan>;
  appendGoalPlan?: (
    entry: {
      input: string;
      plan: GoalPlan;
      id?: string;
      createdAt?: string;
    },
    graphPath?: string,
  ) => Promise<GoalPlanRecord<GoalPlan>>;
  getGraphSummary?: (graphPath?: string) => Promise<LifeGraphSummary>;
  generateReview?: (
    period: LifeGraphReviewPeriod,
    graphPath?: string,
  ) => Promise<LifeGraphReviewInsights>;
  createLifeGraphClient?: (
    options?: Parameters<typeof createLifeGraphClient>[0],
  ) => LifeGraphClient;
  runTick?: (options: {
    graphPath?: string;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    client?: Pick<LifeGraphClient, 'loadGraph'>;
    logger?: (message: string) => void;
  }) => Promise<TickResult>;
  createEventBusClient?: (options?: CreateEventBusClientOptions) => ManagedEventBus;
  grantVoiceConsent?: () => Promise<void>;
  createVoiceCore?: (options: VoiceCoreOptions) => VoiceRuntimeController;
  createModuleLoader?: (options?: Parameters<typeof createModuleLoader>[0]) => ModuleLoader;
  moduleLoader?: ModuleLoader;
  defaultModules?: LifeOSModule[];
  waitForSignal?: () => Promise<void>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  fileExists?: (path: string) => boolean;
  createSpinner?: (text: string) => SpinnerLike;
  voicePublishTimeoutMs?: number;
  voiceCloseTimeoutMs?: number;
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

function createCliEvent<T extends Record<string, unknown>>(type: string, data: T): BaseEvent<T> {
  return createRuntimeEvent(type, data, 'lifeos-cli');
}

function createRuntimeEvent<T extends Record<string, unknown>>(
  type: string,
  data: T,
  source: string,
): BaseEvent<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source,
    version: '0.1.0',
    data,
  };
}

function createDefaultEventBusClient(
  dependencies: RunCliDependencies,
): (options?: CreateEventBusClientOptions) => ManagedEventBus {
  return dependencies.createEventBusClient ?? createEventBusClient;
}

async function publishEventSafely<T extends Record<string, unknown>>(
  topic: string,
  data: T,
  dependencies: RunCliDependencies,
  env: NodeJS.ProcessEnv,
  verboseLog: (line: string) => void,
): Promise<EventBusTransport> {
  const createBus = createDefaultEventBusClient(dependencies);
  const eventBus = createBus({
    env,
    name: 'lifeos-cli-publisher',
    timeoutMs: 1000,
    maxReconnectAttempts: 0,
    logger: (line) => verboseLog(line),
  });
  let transport: EventBusTransport = eventBus.getTransport();
  try {
    await Promise.race([
      eventBus.publish(topic, createCliEvent(topic, data)),
      (async () => {
        await delay(2000);
        throw new Error(`event publish timeout for topic ${topic}`);
      })(),
    ]);
    transport = eventBus.getTransport();
    verboseLog(`event_published topic=${topic}`);
  } catch (error: unknown) {
    transport = eventBus.getTransport();
    verboseLog(`event_publish_skipped topic=${topic} reason=${normalizeErrorMessage(error)}`);
  } finally {
    await Promise.race([
      eventBus.close(),
      (async () => {
        await delay(1500);
      })(),
    ]);
  }
  return transport;
}

function waitForSignalDefault(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      process.off('SIGINT', complete);
      process.off('SIGTERM', complete);
      resolve();
    };
    process.on('SIGINT', complete);
    process.on('SIGTERM', complete);
  });
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

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
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

  if (/failed after 3 attempts|could not parse or repair json|invalid life graph/i.test(message)) {
    return {
      message: 'Model output did not match the expected goal-plan schema.',
      guidance:
        'Try re-running with a clearer goal statement. Use --verbose to inspect safe parse diagnostics.',
    };
  }

  return { message };
}

function normalizeReviewPeriod(period: string): LifeGraphReviewPeriod {
  return period === 'daily' ? 'daily' : 'weekly';
}

function normalizeTaskAction(action: string): TaskCommandOptions['action'] | null {
  if (action === 'list' || action === 'complete' || action === 'next') {
    return action;
  }

  return null;
}

function normalizeModulesAction(action: string): ModulesCommandOptions['action'] | null {
  if (action === 'list' || action === 'load') {
    return action;
  }

  return null;
}

function normalizeVoiceMode(action: string): VoiceCommandOptions['mode'] | null {
  if (action === 'start' || action === 'demo' || action === 'consent' || action === 'calendar') {
    return action;
  }

  return null;
}

function normalizeVoiceScenario(
  scenario: string | undefined,
): keyof typeof VOICE_DEMO_SCENARIOS | undefined {
  if (!scenario) {
    return undefined;
  }
  if (scenario in VOICE_DEMO_SCENARIOS) {
    return scenario as keyof typeof VOICE_DEMO_SCENARIOS;
  }
  return undefined;
}

function resolveVoiceDemoText(options: VoiceCommandOptions): string {
  const trimmed = options.text.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  const scenario = options.scenario ?? 'task';
  return VOICE_DEMO_SCENARIOS[scenario];
}

function extractGraphPathArg(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) {
      continue;
    }
    if (token === '--graph-path') {
      return args[index + 1];
    }
    if (token.startsWith('--graph-path=')) {
      const value = token.slice('--graph-path='.length).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

function resolveDefaultModules(dependencies: RunCliDependencies): LifeOSModule[] {
  return (
    dependencies.defaultModules ?? [
      reminderModule,
      calendarModule,
      schedulerModule,
      researchModule,
      notesModule,
      weatherModule,
      newsModule,
    ]
  );
}

function buildClientOptions(
  baseCwd: string,
  env: NodeJS.ProcessEnv,
  graphPath?: string,
): Parameters<typeof createLifeGraphClient>[0] {
  const options: Parameters<typeof createLifeGraphClient>[0] = { baseDir: baseCwd, env };
  if (graphPath) {
    options.graphPath = graphPath;
  }
  return options;
}

function createVoicePublisher(
  dependencies: RunCliDependencies,
  env: NodeJS.ProcessEnv,
  verboseLog: (line: string) => void,
): NonNullable<VoiceCoreOptions['publish']> {
  const publishTimeoutMs = dependencies.voicePublishTimeoutMs ?? DEFAULT_VOICE_PUBLISH_TIMEOUT_MS;

  if (dependencies.moduleLoader) {
    return async (topic, data, source) => {
      const publishPromise = Promise.resolve(
        dependencies.moduleLoader?.publish(topic, data, source),
      ).then(() => undefined);
      await withTimeout(
        publishPromise,
        publishTimeoutMs,
        `voice publish timeout for topic ${topic}`,
      );
    };
  }

  return async (topic, data, source = 'voice-core') => {
    const createBus = createDefaultEventBusClient(dependencies);
    const eventBus = createBus({
      env,
      name: 'lifeos-cli-voice',
      timeoutMs: 1000,
      maxReconnectAttempts: 0,
      logger: (line) => verboseLog(line),
    });

    try {
      await withTimeout(
        eventBus.publish(topic, createRuntimeEvent(topic, data, source)),
        publishTimeoutMs,
        `voice publish timeout for topic ${topic}`,
      );
    } finally {
      await withTimeout(eventBus.close(), publishTimeoutMs, 'voice event bus close timeout').catch(
        (error: unknown) => {
          verboseLog(`voice_event_bus_close_degraded reason=${normalizeErrorMessage(error)}`);
        },
      );
    }
  };
}

function createVoiceRuntime(
  options: VoiceCommandOptions,
  dependencies: RunCliDependencies,
  env: NodeJS.ProcessEnv,
  verboseLog: (line: string) => void,
  writeStdout: (message: string) => void,
): VoiceRuntimeController {
  const factory = dependencies.createVoiceCore ?? createVoiceCore;
  const voiceOptions: VoiceCoreOptions = {
    env,
    graphPath: options.graphPath,
    publish: createVoicePublisher(dependencies, env, verboseLog),
    logger: (line) => {
      writeStdout(`${chalk.cyan(`[voice] ${line}`)}\n`);
    },
  };
  if (dependencies.now) {
    voiceOptions.now = dependencies.now;
  }
  return factory(voiceOptions);
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
  const interpret = dependencies.interpretGoal ?? interpretGoal;
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
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
  verboseLog(`graph_path=${options.graphPath}`);

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
      model?: string;
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
      const saved = dependencies.appendGoalPlan
        ? await dependencies.appendGoalPlan(
            {
              input: normalizedGoal,
              plan,
            },
            options.graphPath,
          )
        : await (async (): Promise<GoalPlanRecord<GoalPlan>> => {
            const graphClient = createClient({ graphPath: options.graphPath, env });
            const id = await graphClient.createNode(
              'plan',
              plan as unknown as Record<string, unknown>,
            );
            return {
              id,
              createdAt: plan.createdAt,
              input: normalizedGoal,
              plan,
            };
          })();
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
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  const summarize =
    dependencies.getGraphSummary ??
    (async (graphPath?: string) =>
      createClient(buildClientOptions(baseCwd, env, graphPath)).getSummary());

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  verboseLog(`graph_path=${options.graphPath}`);

  try {
    verboseLog('stage=summary_load_started');
    const summary = await summarize(options.graphPath);
    verboseLog('stage=summary_load_completed');

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(summary, null, 2)}\n`);
      return 0;
    }

    writeStdout(`${printGraphSummary(summary)}\n`);
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  }
}

export async function runReviewCommand(
  options: ReviewCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  const review =
    dependencies.generateReview ??
    (async (period: LifeGraphReviewPeriod, graphPath?: string) =>
      createClient(buildClientOptions(baseCwd, env, graphPath)).generateReview(period));

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  verboseLog(`graph_path=${options.graphPath}`);
  verboseLog(`period=${options.period}`);

  try {
    verboseLog('stage=review_generation_started');
    const insights = await review(options.period, options.graphPath);
    verboseLog('stage=review_generation_completed');

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(insights, null, 2)}\n`);
      return 0;
    }

    writeStdout(`${printReviewInsights(insights)}\n`);
    return 0;
  } catch (error: unknown) {
    const message = normalizeErrorMessage(error);
    writeStderr(`${chalk.red.bold('Error:')} ${message}\n`);
    if (/fetch failed|econnrefused|connection refused/i.test(message)) {
      writeStderr(`${chalk.yellow('Quick fix:\n  ollama serve\n  ollama pull llama3.1:8b')}\n`);
    }
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  }
}

export async function runTaskCommand(
  options: TaskCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    verboseLog(`graph_path=${options.graphPath}`);
    verboseLog(`action=${options.action}`);

    if (options.action === 'list') {
      await handleTaskList(client, {
        outputJson: options.outputJson,
        stdout: writeStdout,
        now: now(),
      });
      return 0;
    }

    if (options.action === 'complete') {
      const completedTask = await handleTaskComplete(options.taskId, client, {
        outputJson: options.outputJson,
        stdout: writeStdout,
        now: now(),
      });
      const eventPayload = {
        taskId: completedTask.id,
        goalId: completedTask.goalId,
        title: completedTask.title,
        status: completedTask.status,
        completedAt: new Date().toISOString(),
      };
      if (dependencies.moduleLoader) {
        await dependencies.moduleLoader.publish(
          Topics.lifeos.taskCompleted,
          eventPayload,
          'lifeos-cli',
        );
      }
      await publishEventSafely(
        Topics.lifeos.taskCompleted,
        eventPayload,
        dependencies,
        env,
        verboseLog,
      );
      return 0;
    }

    await handleNextActions(client, {
      outputJson: options.outputJson,
      stdout: writeStdout,
      now: now(),
    });
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  }
}

export async function runTickCommand(
  options: TickCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const tick = dependencies.runTick ?? runTick;
  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    const result = await tick({
      graphPath: options.graphPath,
      env,
      now: now(),
      logger: (line) => {
        verboseLog(line);
      },
    });

    let publishTransport: EventBusTransport = 'unknown';
    if (result.overdueTasks.length > 0) {
      const eventPayload = {
        checkedTasks: result.checkedTasks,
        overdueTasks: result.overdueTasks,
        tickedAt: result.now,
      };
      if (dependencies.moduleLoader) {
        await dependencies.moduleLoader.publish(
          Topics.lifeos.tickOverdue,
          eventPayload,
          'lifeos-cli',
        );
      }
      publishTransport = await publishEventSafely(
        Topics.lifeos.tickOverdue,
        eventPayload,
        dependencies,
        env,
        verboseLog,
      );
    }

    if (!options.outputJson && publishTransport === 'in-memory') {
      writeStdout(
        chalk.yellow(
          'NATS unavailable, using in-memory fallback mode. Module reactions remain active.\n',
        ),
      );
    }

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (result.overdueTasks.length === 0) {
      writeStdout(
        `${boxen(
          chalk.green(`Tick complete. Checked ${result.checkedTasks} task(s), no overdue tasks.`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          },
        )}\n`,
      );
      return 0;
    }

    writeStdout(
      `${boxen(
        chalk.red(
          `Tick complete. Checked ${result.checkedTasks} task(s), found ${result.overdueTasks.length} overdue.`,
        ),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
        },
      )}\n`,
    );
    result.overdueTasks.slice(0, 10).forEach((task) => {
      writeStdout(
        `- ${task.id.slice(0, 8)} | ${task.goalTitle} | ${task.title} | due ${task.dueDate}\n`,
      );
    });
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runDemoCommand(
  options: DemoCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  writeStdout(
    `${boxen(chalk.bold.blue('LifeOS Demo Starting...'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'blue',
    })}\n`,
  );

  const goalExitCode = await runGoalCommand(
    options.goal,
    {
      outputJson: false,
      save: true,
      model: options.model,
      graphPath: options.graphPath,
      verbose: options.verbose,
    },
    dependencies,
  );

  if (goalExitCode !== 0) {
    writeStderr(`${chalk.red.bold('Error:')} Demo stopped during goal decomposition.\n`);
    return goalExitCode;
  }

  const tickExitCode = await runTickCommand(
    {
      outputJson: false,
      graphPath: options.graphPath,
      verbose: options.verbose,
    },
    dependencies,
  );

  if (tickExitCode !== 0) {
    writeStderr(`${chalk.red.bold('Error:')} Demo stopped during tick execution.\n`);
    return tickExitCode;
  }

  writeStdout(
    `${boxen(chalk.green('Demo complete! LifeOS is now running as your personal AI node.'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'green',
    })}\n`,
  );
  writeStdout('Next: `lifeos status`, `lifeos task list`, `lifeos modules`\n');

  return 0;
}

export async function runVoiceCommand(
  options: VoiceCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const waitForSignal = dependencies.waitForSignal ?? waitForSignalDefault;

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  let voice: VoiceRuntimeController | null = null;
  try {
    if (options.mode === 'consent') {
      await (dependencies.grantVoiceConsent ?? consent.grantConsent.bind(consent))();
      writeStdout(chalk.green('Microphone access granted permanently.\n'));
      return 0;
    }

    if (options.mode === 'calendar') {
      writeStdout(chalk.blue('Voice calendar mode active.\n'));
      return 0;
    }

    voice = createVoiceRuntime(options, dependencies, env, verboseLog, writeStdout);

    if (options.mode === 'demo') {
      const demoText = resolveVoiceDemoText(options);
      const outcome = await voice.runDemo(demoText);
      if (!outcome) {
        writeStderr(
          `${chalk.red.bold('Error:')} Demo text must include the wake phrase or follow a wake-only prompt.\n`,
        );
        return 1;
      }

      writeStdout(
        `${boxen(chalk.green('Voice demo complete.'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })}\n`,
      );
      writeStdout(`Command: ${demoText}\n`);
      writeStdout(`Action: ${outcome.action}\n`);
      writeStdout(`LifeOS: ${outcome.responseText}\n`);
      if (outcome.planId) {
        writeStdout(`Plan: ${outcome.planId}\n`);
      }
      if (outcome.taskId) {
        writeStdout(`Task: ${outcome.taskId}\n`);
      }
      return 0;
    }

    await voice.start();
    writeStdout(chalk.blue(`LifeOS Voice Core active. Say "${voice.getWakePhrase()}" anytime.\n`));
    writeStdout(chalk.gray('Press Ctrl+C to stop.\n'));
    await waitForSignal();
    return 0;
  } catch (error: unknown) {
    if (error instanceof MissingMicrophoneConsentError) {
      writeStderr(`${chalk.red.bold('Error:')} ${error.message}\n`);
      writeStderr(
        `${chalk.yellow('Quick fix:\n  pnpm lifeos voice consent\n  then run `pnpm lifeos voice start`')}\n`,
      );
      return 1;
    }

    if (error instanceof UnsupportedVoicePlatformError) {
      writeStderr(`${chalk.red.bold('Error:')} ${error.message}\n`);
      writeStderr(
        `${chalk.yellow('Quick fix:\n  use `lifeos voice demo`\n  or run on Windows with a local microphone and speech recognizer installed')}\n`,
      );
      return 1;
    }

    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  } finally {
    if (voice) {
      const closeTimeoutMs = dependencies.voiceCloseTimeoutMs ?? DEFAULT_VOICE_CLOSE_TIMEOUT_MS;
      await withTimeout(voice.close(), closeTimeoutMs, 'voice runtime shutdown timeout').catch(
        (error: unknown) => {
          writeStderr(
            `${chalk.yellow(
              `[warn] Voice runtime shutdown degraded: ${normalizeErrorMessage(error)}`,
            )}\n`,
          );
        },
      );
    }
  }
}

export async function runResearchCommand(
  options: ResearchCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  const query = options.query.trim();
  if (!query) {
    writeStderr(`${chalk.red.bold('Error:')} Research query is required.\n`);
    return 1;
  }

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  const payload = {
    query,
    utterance: query,
    requestedAt: new Date().toISOString(),
    origin: 'lifeos-cli',
  };

  try {
    if (dependencies.moduleLoader) {
      await dependencies.moduleLoader.publish(
        Topics.lifeos.voiceIntentResearch,
        payload,
        'lifeos-cli',
      );
      verboseLog('research_published_via=module_loader');
    } else {
      const transport = await publishEventSafely(
        Topics.lifeos.voiceIntentResearch,
        payload,
        dependencies,
        env,
        verboseLog,
      );
      verboseLog(`research_published_via=${transport}`);
    }

    writeStdout(chalk.green(`Research request queued: ${query}\n`));
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runEventsListenCommand(
  options: EventsListenCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createBus = createDefaultEventBusClient(dependencies);
  const waitForSignal = dependencies.waitForSignal ?? waitForSignalDefault;

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  const eventBus = createBus({
    env,
    name: 'lifeos-cli-events-listen',
    timeoutMs: 2000,
    maxReconnectAttempts: -1,
    logger: (line) => verboseLog(line),
  });

  try {
    await eventBus.subscribe(options.topic, async (event) => {
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(event)}\n`);
        return;
      }

      const rendered = [
        chalk.cyan(`[${event.type}]`),
        chalk.gray(event.timestamp),
        `source=${event.source}`,
        `${JSON.stringify(event.data)}`,
      ].join(' ');
      writeStdout(`${rendered}\n`);
    });

    if (!options.outputJson) {
      const endpoint = env.LIFEOS_NATS_URL?.trim() || 'nats://127.0.0.1:4222';
      writeStdout(chalk.blue(`Listening for events on "${options.topic}" via ${endpoint}\n`));
      if (eventBus.getTransport() === 'in-memory') {
        writeStdout(
          chalk.yellow(
            'Using fallback mode (in-memory event bus). Start NATS to persist externally.\n',
          ),
        );
      }
      writeStdout(chalk.gray('Press Ctrl+C to stop.\n'));
    }

    await waitForSignal();
    await eventBus.close();
    return 0;
  } catch (error: unknown) {
    await eventBus.close();
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    writeStderr(
      `${chalk.yellow('Quick fix:\n  docker compose up -d nats\n  or run local NATS on nats://127.0.0.1:4222')}\n`,
    );
    return 1;
  }
}

export async function runModulesCommand(
  options: ModulesCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const defaults = resolveDefaultModules(dependencies);
  const knownModules = new Map(defaults.map((module) => [module.id, module]));
  const createLoader = dependencies.createModuleLoader ?? createModuleLoader;

  const ephemeralLoader =
    dependencies.moduleLoader ??
    createLoader({
      env,
      eventBus: createDefaultEventBusClient(dependencies)({
        env,
        name: 'lifeos-cli-modules',
        timeoutMs: 1000,
        maxReconnectAttempts: 0,
      }),
    });
  const shouldClose = !dependencies.moduleLoader;

  try {
    await ephemeralLoader.loadMany(defaults);

    if (options.action === 'load') {
      if (!options.moduleId) {
        writeStderr(`${chalk.red.bold('Error:')} Module id is required for "modules load".\n`);
        return 1;
      }

      const selected = knownModules.get(options.moduleId);
      if (!selected) {
        writeStderr(`${chalk.red.bold('Error:')} Unknown module "${options.moduleId}".\n`);
        return 1;
      }

      await ephemeralLoader.load(selected);
      writeStdout(`${chalk.green(`Loaded module: ${selected.id}`)}\n`);
      return 0;
    }

    const ids = ephemeralLoader.getModuleIds();
    if (ids.length === 0) {
      writeStdout('Loaded modules: none\n');
      return 0;
    }

    writeStdout(`Loaded modules: ${ids.join(', ')}\n`);
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  } finally {
    if (shouldClose) {
      await ephemeralLoader.close();
    }
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
    .option('--json', 'Output summary JSON only')
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

  program
    .command('review')
    .description('Generate daily or weekly insights and next actions')
    .option('--period <period>', 'daily or weekly', 'weekly')
    .option('--json', 'Output review JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runReviewCommand(
        {
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          period: normalizeReviewPeriod(commandOptions.period),
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('task')
    .description('Manage tasks')
    .argument('[action]', 'list | complete | next', 'list')
    .argument('[id]', 'Task ID for complete action')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, id: string | undefined, commandOptions) => {
      const normalizedAction = normalizeTaskAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid task action "${action}". Use list, complete, or next.\n`,
        );
        return;
      }

      const commandExitCode = await runTaskCommand(
        (() => {
          const taskOptions: TaskCommandOptions = {
            action: normalizedAction,
            outputJson: Boolean(commandOptions.json),
            graphPath: commandOptions.graphPath,
            verbose: Boolean(commandOptions.verbose),
          };
          if (id) {
            taskOptions.taskId = id;
          }
          return taskOptions;
        })(),
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('next')
    .description('Show top next actions')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runTaskCommand(
        {
          action: 'next',
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('tick')
    .description('Run a deadline tick and detect overdue tasks')
    .option('--json', 'Output tick result JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runTickCommand(
        {
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('demo')
    .description('Run full end-to-end LifeOS demo (goal -> tick -> reminder reaction)')
    .option('--goal <goal>', 'Override demo goal', 'Prepare taxes by end of month')
    .option(
      '--model <model>',
      'Override model (default: llama3.1:8b or LIFEOS_GOAL_MODEL)',
      defaultModel,
    )
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runDemoCommand(
        {
          goal: commandOptions.goal,
          model: commandOptions.model,
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('research')
    .description('Queue a research request for the research module')
    .argument('<query>', 'Research query')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (query: string, commandOptions) => {
      const commandExitCode = await runResearchCommand(
        {
          query,
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('voice')
    .description('Manage voice runtime: start, demo, consent, or calendar')
    .argument('[mode]', 'start | demo | consent | calendar', 'start')
    .option('--text <text>', 'Demo utterance when mode=demo (overrides --scenario)', '')
    .option(
      '--scenario <scenario>',
      'Demo scenario: task | calendar | research | note | weather | news',
      'task',
    )
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (mode: string, commandOptions) => {
      const normalizedMode = normalizeVoiceMode(mode);
      if (!normalizedMode) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid voice mode "${mode}". Use start, demo, consent, or calendar.\n`,
        );
        return;
      }

      const normalizedScenario = normalizeVoiceScenario(commandOptions.scenario);
      const voiceOptions: VoiceCommandOptions = {
        mode: normalizedMode,
        text: commandOptions.text,
        graphPath: commandOptions.graphPath,
        verbose: Boolean(commandOptions.verbose),
        ...(normalizedScenario ? { scenario: normalizedScenario } : {}),
      };

      const commandExitCode = await runVoiceCommand(voiceOptions, dependencies);
      setExitCode(commandExitCode);
    });

  program
    .command('events')
    .description('Inspect LifeOS event stream')
    .command('listen')
    .description('Listen for published LifeOS events')
    .option('--topic <topic>', 'Subject filter (supports wildcards)', 'lifeos.>')
    .option('--json', 'Output raw event JSON lines')
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runEventsListenCommand(
        {
          topic: commandOptions.topic,
          outputJson: Boolean(commandOptions.json),
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('modules')
    .description('List or load runtime modules')
    .argument('[action]', 'list | load', 'list')
    .argument('[id]', 'Module id for load action')
    .action(async (action: string, id: string | undefined) => {
      const normalizedAction = normalizeModulesAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid modules action "${action}". Use list or load.\n`,
        );
        return;
      }

      const commandExitCode = await runModulesCommand(
        (() => {
          const moduleOptions: ModulesCommandOptions = {
            action: normalizedAction,
          };
          if (id) {
            moduleOptions.moduleId = id;
          }
          return moduleOptions;
        })(),
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
  const args = process.argv.slice(2);
  const bootCandidates =
    !args.includes('--help') && !args.includes('-h') && !args.includes('--version');
  const runtimeGraphPath = extractGraphPathArg(args);

  let runtimeLoader: ModuleLoader | null = null;
  if (bootCandidates) {
    const loaderOptions: Parameters<typeof createModuleLoader>[0] = {
      env: process.env,
      eventBus: createLocalRuntimeEventBus(),
      logger: (line: string) => {
        process.stdout.write(`${chalk.gray(`[modules] ${line}`)}\n`);
      },
    };
    if (runtimeGraphPath) {
      loaderOptions.graphPath = runtimeGraphPath;
    }

    runtimeLoader = createModuleLoader(loaderOptions);

    try {
      await runtimeLoader.loadMany([
        reminderModule,
        calendarModule,
        schedulerModule,
        researchModule,
        notesModule,
        weatherModule,
        newsModule,
      ]);
    } catch {
      await runtimeLoader.close();
      runtimeLoader = null;
    }
  }

  const exitCode = await runCli(args, runtimeLoader ? { moduleLoader: runtimeLoader } : {});
  let forceExit = false;
  if (runtimeLoader) {
    try {
      await Promise.race([
        runtimeLoader.close(),
        (async () => {
          await delay(2000);
          throw new Error('module runtime close timeout');
        })(),
      ]);
    } catch {
      forceExit = true;
      process.stderr.write(`${chalk.yellow('[modules] runtime close timed out; forcing exit')}\n`);
    }
  }
  if (forceExit) {
    process.exit(exitCode);
  }
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  void main();
}
