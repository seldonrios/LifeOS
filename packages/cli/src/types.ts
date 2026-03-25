import type { CreateEventBusClientOptions, ManagedEventBus } from '@lifeos/event-bus';
import type {
  createLifeGraphClient,
  GoalPlan,
  GoalPlanRecord,
  LifeGraphClient,
  LifeGraphReviewInsights,
  LifeGraphReviewPeriod,
  LifeGraphSummary,
} from '@lifeos/life-graph';
import type { GoogleBridgeSubFeature } from '@lifeos/google-bridge';
import type { InterpretGoalStage, TickResult } from '@lifeos/goal-engine';
import type { createModuleLoader, LifeOSModule, ModuleLoader } from '@lifeos/module-loader';
import type { IntentOutcome, VoiceCoreOptions } from '@lifeos/voice-core';

export interface PromptChoice<TValue extends string = string> {
  value: TValue;
  name: string;
  description?: string;
  checked?: boolean;
}

export interface PromptConfirmOptions {
  message: string;
  default?: boolean;
}

export interface PromptInputOptions {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string;
}

export interface PromptSelectOptions<TValue extends string = string> {
  message: string;
  choices: PromptChoice<TValue>[];
  default?: TValue;
}

export interface PromptCheckboxOptions<TValue extends string = string> {
  message: string;
  choices: PromptChoice<TValue>[];
}

export interface ChildProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  removeAllListeners?: () => void;
  kill?: (signal?: NodeJS.Signals | number) => boolean;
}

export interface GraphSummary {
  version: string;
  updatedAt: string;
  totalPlans: number;
  totalGoals: number;
  latestPlanCreatedAt: string;
  latestGoalCreatedAt: string;
  recentPlanTitles: string[];
  recentGoalTitles: string[];
  activeGoals: unknown[];
}
export type VoiceDemoScenario =
  | 'task'
  | 'calendar'
  | 'research'
  | 'note'
  | 'weather'
  | 'news'
  | 'briefing'
  | 'proactive';

export interface GoalCommandOptions {
  outputJson: boolean;
  save: boolean;
  model: string;
  graphPath: string;
  verbose: boolean;
}

export interface InitCommandOptions {
  force: boolean;
  verbose: boolean;
}
export interface StatusCommandOptions {
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

export interface ReviewCommandOptions {
  outputJson: boolean;
  graphPath: string;
  period: LifeGraphReviewPeriod;
  verbose: boolean;
}

export interface TaskCommandOptions {
  action: 'list' | 'complete' | 'next';
  taskId?: string;
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

export interface TickCommandOptions {
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

export interface DemoCommandOptions {
  goal: string;
  model: string;
  graphPath: string;
  verbose: boolean;
}

export interface EventsListenCommandOptions {
  topic: string;
  outputJson: boolean;
  verbose: boolean;
}

export interface ModulesCommandOptions {
  action: 'list' | 'load';
  moduleId?: string;
}

export interface ModuleCommandOptions {
  action:
    | 'create'
    | 'validate'
    | 'list'
    | 'status'
    | 'setup'
    | 'enable'
    | 'disable'
    | 'install'
    | 'certify'
    | 'authorize';
  moduleName?: string;
  subFeatures?: GoogleBridgeSubFeature[];
}

export interface MarketplaceCommandOptions {
  action: 'list' | 'search' | 'refresh';
  term?: string;
  outputJson: boolean;
  certifiedOnly: boolean;
}

export interface MeshCommandOptions {
  action: 'join' | 'status' | 'assign' | 'demo';
  nodeId?: string;
  capability?: string;
  outputJson: boolean;
  verbose: boolean;
}

export interface VoiceCommandOptions {
  mode: 'start' | 'demo' | 'consent' | 'calendar' | 'briefing';
  text: string;
  scenario?: VoiceDemoScenario;
  graphPath: string;
  verbose: boolean;
}

export interface SyncCommandOptions {
  action: 'pair' | 'devices' | 'demo';
  deviceName?: string;
  outputJson: boolean;
  verbose: boolean;
}

export interface MemoryCommandOptions {
  action: 'status';
  outputJson: boolean;
  graphPath: string;
  verbose: boolean;
}

export interface ResearchCommandOptions {
  query: string;
  graphPath: string;
  verbose: boolean;
}

export interface SpinnerLike {
  start(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  stop(): SpinnerLike;
}

export interface VoiceRuntimeController {
  start(): Promise<void>;
  runDemo(text: string): Promise<IntentOutcome | null>;
  close(): Promise<void>;
  getWakePhrase(): string;
}

export interface SpeechOutput {
  speak(text: string): Promise<void>;
}

export interface RunCliDependencies {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  now?: () => Date;
  cwd?: () => string;
  fetchFn?: typeof fetch;
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
  createTextToSpeech?: () => SpeechOutput;
  createVoiceCore?: (options: VoiceCoreOptions) => VoiceRuntimeController;
  createModuleLoader?: (options?: Parameters<typeof createModuleLoader>[0]) => ModuleLoader;
  moduleLoader?: ModuleLoader;
  defaultModules?: LifeOSModule[];
  setOptionalModuleEnabled?: (
    moduleId: string,
    enabled: boolean,
    options?: {
      env?: NodeJS.ProcessEnv;
      statePath?: string;
    },
  ) => Promise<unknown>;
  runGoalCommand?: (
    goal: string,
    options: GoalCommandOptions,
    dependencies?: RunCliDependencies,
  ) => Promise<number>;
  spawnProcess?: (
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      shell?: boolean;
      stdio?: 'pipe' | 'inherit';
    },
  ) => ChildProcessLike;
  confirmPrompt?: (options: PromptConfirmOptions) => Promise<boolean>;
  inputPrompt?: (options: PromptInputOptions) => Promise<string>;
  selectPrompt?: (options: PromptSelectOptions) => Promise<string>;
  checkboxPrompt?: (options: PromptCheckboxOptions) => Promise<string[]>;
  waitForSignal?: () => Promise<void>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  fileExists?: (path: string) => boolean;
  createSpinner?: (text: string) => SpinnerLike;
  voicePublishTimeoutMs?: number;
  voiceCloseTimeoutMs?: number;
}
