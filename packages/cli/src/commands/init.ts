import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import boxen from 'boxen';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import { optionalModules, setOptionalModuleEnabled } from '@lifeos/core';
import { getDefaultLifeGraphPath } from '@lifeos/life-graph';
import {
  MissingMicrophoneConsentError,
  UnsupportedVoicePlatformError,
  consent,
  createVoiceCore,
} from '@lifeos/voice-core';

import { toFriendlyCliError } from '../errors';
import type {
  ChildProcessLike,
  GoalCommandOptions,
  InitCommandOptions,
  PromptChoice,
  RunCliDependencies,
  SpinnerLike,
  VoiceRuntimeController,
} from '../types';

const DEFAULT_MODEL = 'llama3.1:8b';
const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_TIMEOUT_MS = 3_000;
const DEFAULT_MODEL_PULL_TIMEOUT_MS = 10 * 60_000;

interface OllamaModelTagsResponse {
  models?: Array<{
    name?: string;
  }>;
}

interface OllamaDetectionResult {
  reachable: boolean;
  models: string[];
  error?: unknown;
}

interface InitConfig {
  model: string;
  configuredAt: string;
}

const MODULE_DESCRIPTIONS: Record<string, string> = {
  research: 'Research assistant with local memory',
  weather: 'Offline-first weather snapshots',
  news: 'RSS-powered daily digest',
  'habit-streak': 'Daily habit tracking and streak milestones',
  'health-tracker': 'Health metric tracking and voice-driven check-ins',
  'email-summarizer': 'AI-summarized email digest (IMAP)',
  'google-bridge': 'Google Calendar & Gmail integration',
};

const WIZARD_MODULES = optionalModules;

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

function normalizeOllamaHost(host: string | undefined): string {
  const trimmed = host?.trim();
  if (!trimmed) {
    return DEFAULT_OLLAMA_HOST;
  }

  return trimmed.replace(/\/+$/, '');
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

function resolveInitConfigPath(env: NodeJS.ProcessEnv): string {
  return join(resolveHomeDir(env), '.lifeos', 'init.json');
}

function formatInfoBox(lines: string[], borderColor: 'yellow' | 'cyan' | 'green'): string {
  return boxen(lines.join('\n'), {
    padding: 1,
    borderStyle: 'round',
    borderColor,
  });
}

function createPromptChoice<TValue extends string>(
  value: TValue,
  description?: string,
): PromptChoice<TValue> {
  return description
    ? {
        value,
        name: value,
        description,
      }
    : {
        value,
        name: value,
      };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function detectOllama(
  host: string,
  timeoutMs: number,
  dependencies: RunCliDependencies,
): Promise<OllamaDetectionResult> {
  const fetchFn = dependencies.fetchFn ?? fetch;

  try {
    const response = await withTimeout(
      fetchFn(`${normalizeOllamaHost(host)}/api/tags`),
      timeoutMs,
      'fetch failed: Ollama detection timed out',
    );

    if (!response.ok) {
      return {
        reachable: false,
        models: [],
        error: new Error(
          `fetch failed: Ollama returned status ${response.status} - ensure ollama serve is running`,
        ),
      };
    }

    let payload: OllamaModelTagsResponse;
    try {
      payload = (await response.json()) as OllamaModelTagsResponse;
    } catch {
      return {
        reachable: false,
        models: [],
        error: new Error('fetch failed: Ollama response was not valid JSON'),
      };
    }

    const models = (payload.models ?? [])
      .map((entry) => {
        const name = entry.name?.trim() ?? '';
        return name.length > 0 && !name.includes('\0') ? name : '';
      })
      .filter((entry) => entry.length > 0);

    return {
      reachable: true,
      models,
    };
  } catch (error: unknown) {
    return {
      reachable: false,
      models: [],
      error,
    };
  }
}

function setSpinnerText(spinner: SpinnerLike, text: string): void {
  const spinnerWithText = spinner as SpinnerLike & { text?: string };
  if ('text' in spinnerWithText) {
    spinnerWithText.text = text;
  }
}

export async function pullModel(model: string, dependencies: RunCliDependencies): Promise<void> {
  if (!model || model.trim().length === 0 || model.includes('\0')) {
    throw new Error(`Invalid model name: ${model}`);
  }

  const env = dependencies.env ?? process.env;
  const createSpinner = dependencies.createSpinner ?? createDefaultSpinner;
  const configuredTimeoutMs = Number.parseInt(env.LIFEOS_INIT_PULL_TIMEOUT_MS ?? '', 10);
  const modelPullTimeoutMs =
    dependencies.modelPullTimeoutMs ??
    (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : DEFAULT_MODEL_PULL_TIMEOUT_MS);
  const spawnProcess: NonNullable<RunCliDependencies['spawnProcess']> =
    dependencies.spawnProcess ??
    ((command: string, args: string[], options): ChildProcessLike =>
      spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        shell: options?.shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      }));

  const spinner = createSpinner(chalk.blue(`Pulling model ${model}...`)).start();
  const child = spawnProcess('ollama', ['pull', model], {
    env,
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  const lineReaders: Array<{ close: () => void }> = [];

  const attachStream = (stream: NodeJS.ReadableStream | null): void => {
    if (!stream) {
      return;
    }
    const lines = createInterface({ input: stream });
    lineReaders.push(lines);
    lines.on('line', (line) => {
      const normalized = line.trim();
      if (normalized && normalized.length < 500) {
        setSpinnerText(spinner, chalk.blue(`Pulling model ${model}... ${normalized}`));
      }
    });
    lines.on('error', () => {
      // Silently ignore readline errors
    });
  };

  attachStream(child.stdout);
  attachStream(child.stderr);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        child.removeAllListeners?.();
        if (child.kill) {
          try {
            child.kill('SIGTERM');
          } catch {
            // Silently ignore kill errors
          }
        }
        reject(new Error(`ollama pull ${model} exceeded timeout`));
      }, modelPullTimeoutMs);

      child.on('error', (error: Error) => {
        clearTimeout(timeoutHandle);
        if (child.kill) {
          try {
            child.kill('SIGTERM');
          } catch {
            // Silently ignore kill errors
          }
        }
        reject(error);
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutHandle);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ollama pull ${model} exited with code ${code ?? 'unknown'}`));
      });
    });
    spinner.succeed(chalk.green(`Model ${model} is ready.`));
  } catch (error: unknown) {
    spinner.fail(chalk.red(`Failed to pull ${model}.`));
    throw error;
  } finally {
    spinner.stop();
    // Clean up readline interfaces
    for (const reader of lineReaders) {
      try {
        reader.close();
      } catch {
        // Silently ignore close errors
      }
    }
  }
}

export async function writeInitConfig(
  config: InitConfig,
  dependencies: RunCliDependencies,
): Promise<string> {
  if (!config.model || config.model.trim().length === 0) {
    throw new Error('Invalid config: model must be a non-empty string');
  }
  if (!config.configuredAt || config.configuredAt.trim().length === 0) {
    throw new Error('Invalid config: configuredAt must be a non-empty ISO string');
  }

  const env = dependencies.env ?? process.env;
  const path = resolveInitConfigPath(env);

  try {
    await mkdir(dirname(path), { recursive: true });
    const content = `${JSON.stringify(config, null, 2)}\n`;
    await writeFile(path, content, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `Failed to save init config to ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return path;
}

async function runVoiceTest(
  graphPath: string,
  dependencies: RunCliDependencies,
  writeStdout: (message: string) => void,
  writeStderr: (message: string) => void,
): Promise<void> {
  const env = dependencies.env ?? process.env;
  const grantVoiceConsent = dependencies.grantVoiceConsent ?? consent.grantConsent.bind(consent);
  const createVoice = dependencies.createVoiceCore ?? createVoiceCore;

  let voice: VoiceRuntimeController | null = null;

  try {
    await grantVoiceConsent();

    voice = createVoice({
      env,
      graphPath,
      logger: (line) => {
        writeStdout(`${chalk.gray(`[voice] ${line}`)}\n`);
      },
    });

    await voice.runDemo('Hey LifeOS, what time is it');
    writeStdout(`${chalk.green('Voice test completed.')}\n`);
  } catch (error: unknown) {
    if (
      error instanceof UnsupportedVoicePlatformError ||
      error instanceof MissingMicrophoneConsentError
    ) {
      writeStderr(`${chalk.yellow(`${error.message} Skipping voice for now.`)}\n`);
      return;
    }
    throw error;
  } finally {
    if (voice) {
      try {
        await voice.close();
      } catch (closeError: unknown) {
        // Log but don't throw - we want init to continue even if voice cleanup fails
        writeStderr(
          `${chalk.gray(`Warning: Failed to close voice: ${closeError instanceof Error ? closeError.message : 'unknown error'}`)}\n`,
        );
      }
    }
  }
}

async function enableModules(moduleIds: string[], dependencies: RunCliDependencies): Promise<void> {
  const env = dependencies.env ?? process.env;
  const createSpinner = dependencies.createSpinner ?? createDefaultSpinner;
  const setModuleEnabled = dependencies.setOptionalModuleEnabled ?? setOptionalModuleEnabled;
  const spinner = createSpinner(chalk.blue('Saving optional module settings...')).start();

  try {
    for (const moduleId of WIZARD_MODULES) {
      await setModuleEnabled(moduleId, moduleIds.includes(moduleId), { env });
    }
    spinner.succeed(chalk.green('Optional modules configured.'));
  } catch (error: unknown) {
    spinner.fail(chalk.red('Failed to save optional modules.'));
    throw error;
  } finally {
    spinner.stop();
  }
}

export function printCompletionBanner(writeStdout: (message: string) => void): void {
  writeStdout(
    `${formatInfoBox(
      [
        'LifeOS is ready.',
        '',
        'Try these next:',
        '  lifeos status',
        '  lifeos task list',
        '  lifeos voice start',
        '',
        'Need to re-run setup? Use: lifeos init --force',
      ],
      'green',
    )}\n`,
  );
}

async function checkLinuxMicrophoneTools(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync('which arecord', { stdio: 'pipe', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function supportsVoice(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

async function detectVoiceSupport(
  platform: NodeJS.Platform,
  checkLinuxTools?: () => Promise<boolean>,
): Promise<boolean> {
  if (platform === 'linux') {
    const checker = checkLinuxTools ?? checkLinuxMicrophoneTools;
    return await checker();
  }
  return supportsVoice(platform);
}

export async function runInitCommand(
  options: InitCommandOptions,
  dependencies: RunCliDependencies,
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const platform = dependencies.platform ?? process.platform;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);

  // Validate base path
  if (!baseCwd || baseCwd.trim().length === 0) {
    throw new Error('Invalid base working directory');
  }
  if (baseCwd.includes('\0')) {
    throw new Error('Base working directory contains invalid characters');
  }

  const homeDir = resolveHomeDir(env);
  if (!homeDir || homeDir.trim().length === 0) {
    throw new Error('Unable to determine home directory from environment');
  }

  const graphPath = getDefaultLifeGraphPath({
    baseDir: baseCwd,
    env,
    homeDir,
    platform,
  });

  if (!graphPath || graphPath.trim().length === 0) {
    throw new Error('Unable to resolve graph path');
  }

  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const fileExists = dependencies.fileExists ?? existsSync;
  const confirmPrompt = dependencies.confirmPrompt ?? confirm;
  const inputPrompt = dependencies.inputPrompt ?? input;
  const selectPrompt = dependencies.selectPrompt ?? select;
  const checkboxPrompt = dependencies.checkboxPrompt ?? checkbox;
  const runGoalCommand = dependencies.runGoalCommand;

  const verboseLog = (line: string): void => {
    if (options.verbose) {
      writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
    }
  };

  if (!runGoalCommand) {
    throw new Error('runGoalCommand dependency is required for init wizard.');
  }

  verboseLog(`graph_path=${graphPath}`);
  verboseLog(`base_cwd=${baseCwd}`);
  verboseLog(`platform=${platform}`);

  if (fileExists(graphPath) && !options.force) {
    let goalCount: number | null = null;
    try {
      const summary = dependencies.getGraphSummary
        ? await dependencies.getGraphSummary(graphPath)
        : null;
      goalCount = summary?.totalGoals ?? null;
    } catch {
      goalCount = null;
    }

    const summaryLine =
      goalCount === null
        ? 'An existing life graph was detected.'
        : `You already have a life graph with ${goalCount} goal${goalCount === 1 ? '' : 's'}.`;
    writeStdout(`${formatInfoBox([summaryLine], 'yellow')}\n`);
    const shouldContinue = await confirmPrompt({
      message: 'You already have a life graph. Re-run setup anyway?',
      default: false,
    });
    if (!shouldContinue) {
      return 0;
    }
  }

  writeStdout(
    `${formatInfoBox(
      [
        'Welcome to LifeOS - Sovereign Personal AI Node',
        '',
        'This setup keeps your data local by default and can be safely re-run.',
        'Your data is yours, and system methods stay inspectable.',
      ],
      'cyan',
    )}\n`,
  );

  const ollamaHost = normalizeOllamaHost(env.OLLAMA_HOST);
  verboseLog(`ollama_host=${ollamaHost}`);
  let ollama = await detectOllama(ollamaHost, OLLAMA_TIMEOUT_MS, dependencies);
  if (!ollama.reachable) {
    writeStderr(
      `${formatInfoBox(['LifeOS could not reach Ollama.', '', 'Quick fix:', '  ollama serve'], 'yellow')}\n`,
    );
    await confirmPrompt({
      message: 'Press Enter once Ollama is running',
      default: true,
    });
    ollama = await detectOllama(ollamaHost, OLLAMA_TIMEOUT_MS, dependencies);
    if (!ollama.reachable) {
      const friendly = toFriendlyCliError(ollama.error ?? new Error('fetch failed'), {
        command: 'init',
        graphPath,
        model: DEFAULT_MODEL,
      });
      writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
      if (friendly.guidance) {
        writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
      }
      return 1;
    }
  }

  let models = ollama.models;
  while (models.length === 0) {
    const shouldPull = await confirmPrompt({
      message: `No models found. Pull ${DEFAULT_MODEL} now?`,
      default: true,
    });
    if (!shouldPull) {
      writeStderr(`${chalk.red.bold('Error:')} A local model is required to continue.\n`);
      return 1;
    }
    try {
      await pullModel(DEFAULT_MODEL, dependencies);
    } catch (error: unknown) {
      const friendly = toFriendlyCliError(error, {
        command: 'init',
        graphPath,
        model: DEFAULT_MODEL,
      });
      writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
      if (friendly.guidance) {
        writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
      }
      return 1;
    }
    const refreshed = await detectOllama(ollamaHost, OLLAMA_TIMEOUT_MS, dependencies);
    if (!refreshed.reachable) {
      const friendly = toFriendlyCliError(refreshed.error ?? new Error('fetch failed'), {
        command: 'init',
        graphPath,
        model: DEFAULT_MODEL,
      });
      writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
      if (friendly.guidance) {
        writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
      }
      return 1;
    }
    models = refreshed.models;
  }

  if (models.length === 0) {
    writeStderr(
      `${chalk.red.bold('Error:')} No valid models available. Please ensure Ollama is properly configured.\n`,
    );
    return 1;
  }

  const defaultModel = models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0];
  if (!defaultModel) {
    writeStderr(
      `${chalk.red.bold('Error:')} Unable to select a default model. Please try again.\n`,
    );
    return 1;
  }

  const modelPromptOptions = {
    message: 'Choose your AI model:',
    choices: models.map((model) =>
      createPromptChoice(model, model === DEFAULT_MODEL ? 'Recommended default' : undefined),
    ),
  };
  const selectedModel = await selectPrompt(
    defaultModel
      ? {
          ...modelPromptOptions,
          default: defaultModel,
        }
      : modelPromptOptions,
  );

  if (!selectedModel || selectedModel.trim().length === 0 || selectedModel.includes('\0')) {
    writeStderr(`${chalk.red.bold('Error:')} Invalid model selection. Please try again.\n`);
    return 1;
  }

  env.LIFEOS_GOAL_MODEL = selectedModel;
  try {
    await writeInitConfig(
      {
        model: selectedModel,
        configuredAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      },
      dependencies,
    );
  } catch (error: unknown) {
    const friendly = toFriendlyCliError(error, {
      command: 'init',
      graphPath,
      model: selectedModel,
    });
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
    }
    return 1;
  }

  const voiceSupported = await detectVoiceSupport(platform, dependencies.checkLinuxMicrophoneTools);
  if (!voiceSupported) {
    writeStdout(
      'Voice requires a supported local microphone setup on this machine. Skipping for now.\n',
    );
  } else {
    const enableVoice = await confirmPrompt({
      message: 'Would you like to enable voice now? (requires microphone)',
      default: false,
    });
    if (enableVoice) {
      try {
        await runVoiceTest(graphPath, dependencies, writeStdout, writeStderr);
      } catch (error: unknown) {
        if (
          error instanceof UnsupportedVoicePlatformError ||
          error instanceof MissingMicrophoneConsentError
        ) {
          writeStderr(`${chalk.yellow(`${error.message} Skipping voice for now.`)}\n`);
        } else {
          throw error;
        }
      }
    }
  }

  const selectedModules = await checkboxPrompt({
    message: 'Enable optional modules (you can change these anytime):',
    choices: WIZARD_MODULES.map((moduleId) =>
      createPromptChoice(moduleId, MODULE_DESCRIPTIONS[moduleId]),
    ),
  });

  // Validate selected modules
  if (!Array.isArray(selectedModules)) {
    writeStderr(`${chalk.red.bold('Error:')} Invalid module selection.\n`);
    return 1;
  }

  try {
    await enableModules(selectedModules, dependencies);
  } catch (error: unknown) {
    const friendly = toFriendlyCliError(error, {
      command: 'init',
      graphPath,
      model: selectedModel,
    });
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
    }
    return 1;
  }

  const goal = await inputPrompt({
    message:
      "What would you like LifeOS to help with first? (e.g. 'Prepare for the quarterly board meeting')",
    validate(value: string) {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return 'Goal cannot be empty.';
      }
      if (trimmed.length < 5) {
        return 'Enter at least 5 characters.';
      }
      if (trimmed.length > 500) {
        return 'Goal must be less than 500 characters.';
      }
      if (trimmed.includes('\0')) {
        return 'Goal contains invalid characters.';
      }
      return true;
    },
  });

  const goalOptions: GoalCommandOptions = {
    outputJson: false,
    save: true,
    model: selectedModel,
    graphPath,
    verbose: false,
  };

  let goalExitCode: number;
  try {
    goalExitCode = await runGoalCommand(goal, goalOptions, dependencies);
  } catch (error: unknown) {
    const friendly = toFriendlyCliError(error, {
      command: 'goal',
      graphPath,
      model: selectedModel,
    });
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
    }
    return 1;
  }

  if (goalExitCode !== 0) {
    writeStderr(
      `${chalk.yellow('Warning:')} First goal setup returned exit code ${goalExitCode}. You can add goals later.\n`,
    );
  }

  writeStdout(`${chalk.bold('Next steps:')}\n`);
  writeStdout('  lifeos status\n');
  writeStdout('  lifeos task list\n');
  writeStdout('  lifeos voice start\n');
  printCompletionBanner(writeStdout);
  return 0;
}
