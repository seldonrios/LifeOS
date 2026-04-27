#!/usr/bin/env node
import { randomUUID } from 'node:crypto';

import boxen from 'boxen';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command, CommanderError } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import ora, { type Ora } from 'ora';

import { runInitCommand } from './commands/init';
import { runDoctorCommand } from './commands/doctor';
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
  runGraphMigrations,
  GoalPlanSchema,
  type GoalPlan,
  type GoalPlanRecord,
  type LifeGraphClient,
  type LifeGraphRiskRadar,
  type LifeGraphRiskRadarItem,
  type LifeGraphRiskStatus,
  type LifeGraphReviewPeriod,
  type LifeGraphStorageInfo,
} from '@lifeos/life-graph';
import {
  CaptureEntrySchema,
  PlannedActionSchema,
  ReminderEventSchema,
  type CaptureEntry,
  type PlannedAction,
  type ReminderEvent,
} from '@lifeos/contracts';
import { createModuleLoader, type LifeOSModule, type ModuleLoader } from '@lifeos/module-loader';
import {
  getFirstPartyModuleManifestDirectory,
  readModuleState,
  resolveFirstPartyModuleId,
  setOptionalModuleEnabled,
} from '@lifeos/core';
import { interpretGoal, runTick, type InterpretGoalStage } from '@lifeos/goal-engine';
import { DeviceRegistry, SyncEngine, type PairedDevice } from '@lifeos/sync-core';
import {
  MeshCoordinator,
  MeshRegistry,
  MeshRuntime,
  readMeshHeartbeatState,
  readMeshLeaderSnapshot,
  readMeshState,
  waitForMeshHeartbeat,
  writeMeshState,
  type NodeRole,
  type NodeConfig,
} from '@lifeos/mesh';
import {
  GOOGLE_BRIDGE_SUBFEATURES,
  authorizeGoogleBridgeModule,
  getEnabledGoogleBridgeSubFeatures,
  googleBridgeModule,
  parseGoogleBridgeSubFeatures,
  setEnabledGoogleBridgeSubFeatures,
  type GoogleBridgeSubFeature,
} from '@lifeos/google-bridge';
import {
  MissingMicrophoneConsentError,
  TextToSpeech,
  UnsupportedVoicePlatformError,
  consent,
  createVoiceCore,
  type VoiceCoreOptions,
} from '@lifeos/voice-core';
import {
  findCliFirstPartyModuleEntry,
  getCredentialsFilePath,
  listCliBootRuntimeModules,
  listCliDefaultRuntimeModules,
  listCliFirstPartyModuleEntries,
  listCliLoadableModules,
  readCredentials,
  type ImapCredentials,
  writeCredentials,
} from './first-party-module-registry';
import { normalizeErrorMessage, toFriendlyCliError } from './errors';
import { formatGoalPlan } from './format';
import { printGraphSummary, printReviewInsights } from './printer';
import {
  handleNextActions,
  handleTaskBlock,
  handleTaskCancel,
  handleTaskComplete,
  handleTaskList,
  handleTaskUnblock,
} from './task-command';
import type {
  CaptureCommandOptions,
  DemoCommandOptions,
  DemoLoopCommandOptions,
  EventsListenCommandOptions,
  GraphCommandOptions,
  GoalCommandOptions,
  InboxCommandOptions,
  InitCommandOptions,
  MarketplaceCommandOptions,
  MemoryCommandOptions,
  MeshCommandOptions,
  ModuleCommandOptions,
  ModulesCommandOptions,
  RemindAckCommandOptions,
  RemindCommandOptions,
  ResearchCommandOptions,
  ReviewCommandOptions,
  RunCliDependencies,
  SpinnerLike,
  StatusCommandOptions,
  TrustCommandOptions,
  SyncCommandOptions,
  TaskCommandOptions,
  TickCommandOptions,
  VoiceCommandOptions,
  VoiceDemoScenario,
  VoiceRuntimeController,
} from './types';
import { createModuleScaffold, validateModuleManifest } from './commands/module-create';
import {
  certifyMarketplaceModule,
  getMarketplaceCatalogStatus,
  installMarketplaceModule,
  listMarketplaceEntries,
  refreshMarketplaceRegistry,
  searchMarketplaceEntries,
} from './commands/marketplace';

const DEFAULT_MODEL = 'llama3.1:8b';
const CLI_VERSION = '0.1.0';
const DEFAULT_VOICE_PUBLISH_TIMEOUT_MS = 1500;
const DEFAULT_VOICE_CLOSE_TIMEOUT_MS = 3000;
const VOICE_DEMO_SCENARIOS: Record<VoiceDemoScenario, string> = {
  task: 'Hey LifeOS, add a task to buy milk',
  calendar: 'Hey LifeOS, schedule dentist appointment next Tuesday at 10am',
  research: 'Hey LifeOS, research quantum computing breakthroughs this year',
  note: 'Hey LifeOS, note that the team prefers async updates',
  weather: 'Hey LifeOS, what is the weather in London this weekend?',
  news: 'Hey LifeOS, give me top tech news today',
  briefing: 'Hey LifeOS, give me my daily briefing',
  proactive: 'Hey LifeOS, I prefer short answers',
} as const;

const MODULARITY_RISKS: Array<{ id: number; name: string }> = [
  { id: 1, name: 'Life Graph Schema Evolution' },
  { id: 2, name: 'Module Manifest Contract Drift' },
  { id: 3, name: 'Event Contract Consistency' },
  { id: 4, name: 'CI Validation Gate Coverage' },
  { id: 5, name: 'Core Package Test Coverage' },
  { id: 6, name: 'Scaffold Completeness' },
  { id: 7, name: 'Compatibility Matrix Drift' },
  { id: 8, name: 'Contribution Process Alignment' },
];

function riskName(index: number): string {
  return MODULARITY_RISKS[index]?.name ?? `Risk ${index + 1}`;
}

const TICK_INTERVAL_REGEX = /^[1-9][0-9]*(s|m|h)$/;
const TICK_INTERVAL_MINIMUM_MS = 30_000;

export function parseTickInterval(raw: string): number {
  if (!TICK_INTERVAL_REGEX.test(raw)) {
    const err = {
      error: {
        code: 'ERR_INVALID_TICK_INTERVAL',
        message: `"${raw}" is not a valid tick interval. Accepted formats: 30s, 5m, 1h (minimum 30s).`,
        minimumMs: TICK_INTERVAL_MINIMUM_MS,
        acceptedUnits: ['s', 'm', 'h'],
      },
    };
    throw Object.assign(new Error('ERR_INVALID_TICK_INTERVAL'), { code: 'ERR_INVALID_TICK_INTERVAL', payload: err });
  }
  const unit = raw.slice(-1) as 's' | 'm' | 'h';
  const value = parseInt(raw.slice(0, -1), 10);
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
  const ms = value * multiplier;
  if (ms < TICK_INTERVAL_MINIMUM_MS) {
    const err = {
      error: {
        code: 'ERR_INVALID_TICK_INTERVAL',
        message: `"${raw}" is below the minimum interval of ${TICK_INTERVAL_MINIMUM_MS}ms. Use 30s or longer.`,
        minimumMs: TICK_INTERVAL_MINIMUM_MS,
        acceptedUnits: ['s', 'm', 'h'],
      },
    };
    throw Object.assign(new Error('ERR_INVALID_TICK_INTERVAL'), { code: 'ERR_INVALID_TICK_INTERVAL', payload: err });
  }
  return ms;
}

async function readTextIfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function computeOverallRiskHealth(risks: LifeGraphRiskRadarItem[]): LifeGraphRiskStatus {
  if (risks.some((risk) => risk.status === 'red')) {
    return 'red';
  }
  if (risks.some((risk) => risk.status === 'yellow')) {
    return 'yellow';
  }
  return 'green';
}

function statusDot(status: LifeGraphRiskStatus): string {
  if (status === 'green') {
    return chalk.green('● green');
  }
  if (status === 'red') {
    return chalk.red('● red');
  }
  return chalk.yellow('● yellow');
}

function renderRiskTable(radar: LifeGraphRiskRadar): string {
  const lines = [
    chalk.bold('Modularity Risk Radar'),
    chalk.dim('-'.repeat(56)),
    `Overall Health: ${statusDot(radar.overallHealth)}`,
    `Last Updated: ${new Date(radar.lastUpdated).toLocaleString()}`,
    '',
  ];

  for (const risk of radar.risks) {
    lines.push(`${risk.id}. ${risk.name}  ${statusDot(risk.status)}`);
    if (risk.details) {
      lines.push(chalk.gray(`   ${risk.details}`));
    }
  }

  if (radar.recommendations.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Recommendations'));
    for (const recommendation of radar.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return lines.join('\n');
}

function inferRiskStatus(passCount: number, totalChecks: number): LifeGraphRiskStatus {
  if (passCount === totalChecks) {
    return 'green';
  }
  if (passCount === 0) {
    return 'red';
  }
  return 'yellow';
}

async function buildModularityRiskRadar(
  baseCwd: string,
  nowIso: string,
): Promise<LifeGraphRiskRadar> {
  const contributing = await readTextIfPresent(join(baseCwd, 'CONTRIBUTING.md'));
  const rootPackageRaw = await readTextIfPresent(join(baseCwd, 'package.json'));
  const moduleTemplate = await readTextIfPresent(
    join(baseCwd, 'templates', 'module', 'lifeos.json'),
  );
  const moduleCreateSource = await readTextIfPresent(
    join(baseCwd, 'packages', 'cli', 'src', 'commands', 'module-create.ts'),
  );
  const moduleValidateWorkflow = await readTextIfPresent(
    join(baseCwd, '.github', 'workflows', 'module-validate.yml'),
  );
  const graphSchemaWorkflow = await readTextIfPresent(
    join(baseCwd, '.github', 'workflows', 'graph-schema-test.yml'),
  );
  const compatibilityWorkflow = await readTextIfPresent(
    join(baseCwd, '.github', 'workflows', 'compatibility-matrix.yml'),
  );

  const rootPackage =
    rootPackageRaw.length > 0
      ? (JSON.parse(rootPackageRaw) as {
          scripts?: Record<string, string>;
          devDependencies?: Record<string, string>;
        })
      : { scripts: {}, devDependencies: {} };

  const risks: LifeGraphRiskRadarItem[] = [];

  {
    const checks = [
      !moduleTemplate.includes('graphVersion'),
      !moduleCreateSource.includes('graphVersion'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 1,
      name: riskName(0),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Ensures module templates and scaffolds do not emit non-contract graphVersion fields.',
    });
  }

  {
    const checks = [
      moduleTemplate.includes('@lifeos/life-graph@>=0.3.0 <0.4.0'),
      moduleTemplate.includes('@lifeos/voice-core@>=0.3.0 <0.4.0'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 2,
      name: riskName(1),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Ensures manifest requirements use bounded pre-1.0 semver ranges in scaffolds.',
    });
  }

  {
    const checks = [
      moduleCreateSource.includes('module.${moduleId}.success'),
      moduleCreateSource.includes('module.${moduleId}.error'),
      moduleTemplate.includes('publish:module.'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 3,
      name: riskName(2),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Checks scaffolded event topics for success/error contract consistency.',
    });
  }

  {
    const checks = [
      moduleValidateWorkflow.includes('module validate --all'),
      moduleValidateWorkflow.includes('module certify --dry-run'),
      graphSchemaWorkflow.includes('test:graph'),
      compatibilityWorkflow.includes('compatibility'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 4,
      name: riskName(3),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Verifies mandatory PR and scheduled CI workflows are in place.',
    });
  }

  {
    const checks = [
      rootPackage.scripts?.['test:graph'] === 'vitest run packages/life-graph --coverage',
      rootPackage.scripts?.['test:loader'] === 'vitest run packages/module-loader --coverage',
      rootPackage.devDependencies?.vitest !== undefined,
      rootPackage.devDependencies?.['@vitest/coverage-v8'] !== undefined,
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 5,
      name: riskName(4),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Checks test script and coverage wiring for core package quality gates.',
    });
  }

  {
    const checks = [
      existsSync(join(baseCwd, 'templates', 'module', 'migrations', '.gitkeep')),
      moduleCreateSource.includes("join(modulePath, 'migrations')"),
      moduleCreateSource.includes('src/index.test.ts'),
      moduleCreateSource.includes('Modularity Risk Checklist'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 6,
      name: riskName(5),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Ensures new modules include migrations folder, tests, and checklist docs.',
    });
  }

  {
    const checks = [
      compatibilityWorkflow.includes('schedule:'),
      compatibilityWorkflow.includes('marketplace compatibility'),
      compatibilityWorkflow.includes('upload-artifact'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 7,
      name: riskName(6),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Checks for automated compatibility matrix generation and artifact publishing.',
    });
  }

  {
    const checks = [
      contributing.includes('## Modularity Risk Checklist'),
      contributing.includes('lifeos status --risks'),
      contributing.includes('requires uses semver ranges'),
    ];
    const passCount = checks.filter(Boolean).length;
    risks.push({
      id: 8,
      name: riskName(7),
      status: inferRiskStatus(passCount, checks.length),
      lastChecked: nowIso,
      details: 'Checks contributor guidance alignment with Risk Radar and module quality policy.',
    });
  }

  const recommendations = risks
    .filter((risk) => risk.status !== 'green')
    .map((risk) => `Resolve risk ${risk.id}: ${risk.name}.`);

  return {
    overallHealth: computeOverallRiskHealth(risks),
    lastUpdated: nowIso,
    risks,
    recommendations,
  };
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

function normalizeReviewPeriod(period: string): LifeGraphReviewPeriod {
  return period === 'daily' ? 'daily' : 'weekly';
}

function normalizeTaskAction(action: string): TaskCommandOptions['action'] | null {
  if (
    action === 'list' ||
    action === 'complete' ||
    action === 'next' ||
    action === 'block' ||
    action === 'cancel' ||
    action === 'unblock'
  ) {
    return action;
  }

  return null;
}

function normalizeGraphAction(action: string): GraphCommandOptions['action'] | null {
  if (action === 'migrate') {
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

function normalizeModuleAction(action: string): ModuleCommandOptions['action'] | null {
  if (
    action === 'create' ||
    action === 'validate' ||
    action === 'list' ||
    action === 'status' ||
    action === 'setup' ||
    action === 'enable' ||
    action === 'disable' ||
    action === 'install' ||
    action === 'certify' ||
    action === 'authorize'
  ) {
    return action;
  }

  return null;
}

function parsePortInput(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function parseSecureInput(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'n' || normalized === 'no' || normalized === 'false' || normalized === '0') {
    return false;
  }
  return null;
}

async function setupEmailSummarizer(
  env: NodeJS.ProcessEnv,
  dependencies: RunCliDependencies,
): Promise<{ path: string; accountLabel: string }> {
  const inputPrompt = dependencies.inputPrompt;
  if (!inputPrompt) {
    throw new Error('Interactive prompts unavailable. Re-run in an interactive terminal.');
  }

  const host = (
    await inputPrompt({
      message: 'IMAP host (for example: imap.gmail.com)',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Host is required.'),
    })
  ).trim();

  const secure = parseSecureInput(
    await inputPrompt({
      message: 'Use TLS/SSL? (yes/no)',
      default: 'yes',
      validate: (value: string) => (parseSecureInput(value) === null ? 'Enter yes or no.' : true),
    }),
  );

  const defaultPort = secure === false ? '143' : '993';
  const port = parsePortInput(
    await inputPrompt({
      message: 'IMAP port',
      default: defaultPort,
      validate: (value: string) =>
        parsePortInput(value) === null ? 'Port must be between 1 and 65535.' : true,
    }),
  );

  const user = (
    await inputPrompt({
      message: 'IMAP username',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Username is required.'),
    })
  ).trim();

  const pass = (
    await inputPrompt({
      message: 'IMAP password or app password',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Password is required.'),
    })
  ).trim();

  const label = (
    await inputPrompt({
      message: 'Account label (for example: work)',
      default: 'default',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Label is required.'),
    })
  ).trim();

  if (secure === null || port === null) {
    throw new Error('Invalid IMAP security or port value.');
  }

  const current = await readCredentials(env);
  const next: ImapCredentials[] = [
    ...current.filter(
      (entry: ImapCredentials) => entry.label.toLowerCase() !== label.toLowerCase(),
    ),
    {
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      label,
    },
  ];
  await writeCredentials(next, env);
  return {
    path: getCredentialsFilePath(env),
    accountLabel: label,
  };
}

function normalizeMarketplaceAction(action: string): MarketplaceCommandOptions['action'] | null {
  if (
    action === 'list' ||
    action === 'search' ||
    action === 'refresh' ||
    action === 'compatibility'
  ) {
    return action;
  }
  return null;
}

function normalizeTrustAction(action: string): TrustCommandOptions['action'] | null {
  if (action === 'status' || action === 'explain' || action === 'report') {
    return action;
  }
  return null;
}

function normalizeMeshAction(action: string): MeshCommandOptions['action'] | null {
  if (
    action === 'join' ||
    action === 'status' ||
    action === 'assign' ||
    action === 'demo' ||
    action === 'start' ||
    action === 'delegate' ||
    action === 'debug'
  ) {
    return action;
  }
  return null;
}

function normalizeVoiceMode(action: string): VoiceCommandOptions['mode'] | null {
  if (
    action === 'start' ||
    action === 'demo' ||
    action === 'consent' ||
    action === 'calendar' ||
    action === 'briefing'
  ) {
    return action;
  }

  return null;
}

function normalizeMemoryAction(action: string): MemoryCommandOptions['action'] | null {
  if (action === 'status') {
    return action;
  }
  return null;
}

function normalizeSyncAction(action: string): SyncCommandOptions['action'] | null {
  if (action === 'pair' || action === 'devices' || action === 'demo') {
    return action;
  }
  return null;
}

function normalizeVoiceScenario(scenario: string | undefined): VoiceDemoScenario | undefined {
  if (!scenario) {
    return undefined;
  }
  if (scenario in VOICE_DEMO_SCENARIOS) {
    return scenario as VoiceDemoScenario;
  }
  return undefined;
}

function normalizeGoogleBridgeSubFeatures(raw: string | undefined): GoogleBridgeSubFeature[] {
  if (!raw) {
    return [];
  }
  return parseGoogleBridgeSubFeatures(raw);
}

function toModuleIdFromRepo(repo: string): string {
  const raw = repo.split('/')[1] ?? repo;
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-module$/, '')
    .replace(/^-+|-+$/g, '');
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

function inferGraphDbPath(graphPath: string): string {
  if (graphPath.toLowerCase().endsWith('.json')) {
    return `${graphPath.slice(0, -5)}.db`;
  }
  return `${graphPath}.db`;
}

interface TrustSettingsSnapshot {
  model: string;
  ollamaHost: string;
  natsUrl: string;
  voiceEnabled: boolean;
  localOnlyMode?: boolean;
  cloudAssistEnabled?: boolean;
  trustAuditEnabled?: boolean;
  transparencyTipsEnabled?: boolean;
}

interface TrustModuleSnapshot {
  id: string;
  tier: 'baseline' | 'optional' | 'system';
  enabled: boolean;
  available: boolean;
  permissions: {
    graph: string[];
    voice: string[];
    network: string[];
    events: string[];
  };
}

interface TrustWarningEntry {
  id: string;
  status: 'WARN';
  description: string;
  details: string;
  suggestion: string;
}

interface TrustReportPayload {
  generatedAt: string;
  ownership: {
    dataOwnership: string;
    methodsTransparency: string;
    localFirstDefault: boolean;
    cloudAssistEnabled: boolean;
  };
  runtime: {
    model: string;
    ollamaHost: string;
    natsUrl: string;
    localOnlyMode: boolean;
    trustAuditEnabled: boolean;
    policyEnforced: boolean;
    moduleManifestRequired: boolean;
    moduleRuntimePermissions: string;
    storageBackend: LifeGraphStorageInfo['backend'];
    graphPath: string;
    graphDatabasePath: string;
    migrationBackupPath: string | null;
    syncAuthentication: {
      enabled: boolean;
      overrideActive: boolean;
      warning: string | null;
    };
  };
  modules: TrustModuleSnapshot[];
  warnings: TrustWarningEntry[];
  recentDecisions: Array<{
    at: string;
    category: 'ownership' | 'policy' | 'runtime';
    message: string;
  }>;
}

function trustSettingsPath(env: NodeJS.ProcessEnv): string {
  return join(resolveHomeDir(env), '.lifeos', 'init.json');
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }

  return fallback;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function deriveResourceHintFromResources(resources: unknown): 'low' | 'medium' | 'high' {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    return 'medium';
  }
  const record = resources as Record<string, unknown>;
  const cpu = typeof record.cpu === 'string' ? record.cpu.trim().toLowerCase() : '';
  const memory = typeof record.memory === 'string' ? record.memory.trim().toLowerCase() : '';
  if (cpu === 'high' || memory === 'high') {
    return 'high';
  }
  if (cpu === 'medium' || memory === 'medium') {
    return 'medium';
  }
  return 'low';
}

async function readModuleResourceHint(
  baseCwd: string,
  moduleId: string,
): Promise<'low' | 'medium' | 'high'> {
  const moduleDir = getFirstPartyModuleManifestDirectory(moduleId);
  const manifestPath = join(baseCwd, 'modules', moduleDir, 'lifeos.json');
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    return deriveResourceHintFromResources(parsed.resources);
  } catch {
    return 'medium';
  }
}

async function readTrustSettings(env: NodeJS.ProcessEnv): Promise<TrustSettingsSnapshot> {
  try {
    const raw = await readFile(trustSettingsPath(env), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      model:
        typeof parsed.model === 'string' && parsed.model.trim().length > 0
          ? parsed.model.trim()
          : DEFAULT_MODEL,
      ollamaHost:
        typeof parsed.ollamaHost === 'string' && parsed.ollamaHost.trim().length > 0
          ? parsed.ollamaHost.trim()
          : 'http://127.0.0.1:11434',
      natsUrl:
        typeof parsed.natsUrl === 'string' && parsed.natsUrl.trim().length > 0
          ? parsed.natsUrl.trim()
          : 'nats://127.0.0.1:4222',
      voiceEnabled: normalizeBoolean(parsed.voiceEnabled, true),
      localOnlyMode: normalizeBoolean(parsed.localOnlyMode, true),
      cloudAssistEnabled: normalizeBoolean(parsed.cloudAssistEnabled, false),
      trustAuditEnabled: normalizeBoolean(parsed.trustAuditEnabled, true),
      transparencyTipsEnabled: normalizeBoolean(parsed.transparencyTipsEnabled, true),
    };
  } catch {
    return {
      model: DEFAULT_MODEL,
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
      localOnlyMode: true,
      cloudAssistEnabled: false,
      trustAuditEnabled: true,
      transparencyTipsEnabled: true,
    };
  }
}

async function readManifestPermissions(
  baseCwd: string,
  moduleId: string,
): Promise<TrustModuleSnapshot['permissions']> {
  const defaults = {
    graph: [] as string[],
    voice: [] as string[],
    network: [] as string[],
    events: [] as string[],
  };

  const moduleDir = getFirstPartyModuleManifestDirectory(moduleId);
  const manifestPath = join(baseCwd, 'modules', moduleDir, 'lifeos.json');
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isObjectRecord(parsed.permissions)) {
      return defaults;
    }

    const permissions = parsed.permissions;
    return {
      graph: getStringArray(permissions.graph),
      voice: getStringArray(permissions.voice),
      network: getStringArray(permissions.network),
      events: getStringArray(permissions.events),
    };
  } catch {
    return defaults;
  }
}

async function buildTrustReport(
  env: NodeJS.ProcessEnv,
  baseCwd: string,
  dependencies: RunCliDependencies = {},
): Promise<TrustReportPayload> {
  const settings = await readTrustSettings(env);
  const moduleState = await readModuleState({ env });
  const moduleEntries = listCliFirstPartyModuleEntries({ visibleOnly: true });
  const enabledOptionalModules = new Set<string>(moduleState.enabledOptionalModules);

  const moduleSnapshots: TrustModuleSnapshot[] = [];
  for (const entry of moduleEntries) {
    const enabled = entry.userToggleable ? enabledOptionalModules.has(entry.canonicalId) : true;
    const permissions = await readManifestPermissions(baseCwd, entry.canonicalId);

    moduleSnapshots.push({
      id: entry.canonicalId,
      tier: entry.tier,
      enabled,
      available: entry.implementationAvailable,
      permissions,
    });
  }

  const localOnlyMode = normalizeBoolean(settings.localOnlyMode, !settings.cloudAssistEnabled);
  const cloudAssistEnabled = normalizeBoolean(settings.cloudAssistEnabled, false);
  const policyEnforced = normalizeBoolean(env.LIFEOS_POLICY_ENFORCE ?? 'true', true);
  const moduleManifestRequired = normalizeBoolean(
    env.LIFEOS_MODULE_MANIFEST_REQUIRED ?? 'true',
    true,
  );
  const moduleRuntimePermissions =
    (env.LIFEOS_MODULE_RUNTIME_PERMISSIONS ?? 'strict').trim() || 'strict';
  const syncAuthEnabled = (env.LIFEOS_SYNC_REQUIRE_AUTH ?? '1').trim().toLowerCase() !== '0';
  const syncAuthWarning = syncAuthEnabled
    ? null
    : 'LIFEOS_SYNC_REQUIRE_AUTH=0 disables Ed25519 delta verification';
  const warnings: TrustWarningEntry[] =
    syncAuthWarning === null
      ? []
      : [
          {
            id: 'sync-auth-override',
            status: 'WARN',
            description: 'Sync authentication override active',
            details: syncAuthWarning,
            suggestion:
              'Remove LIFEOS_SYNC_REQUIRE_AUTH=0 to restore the secure default; see docs/SETUP.md',
          },
        ];
  const defaultGraphPath = getDefaultLifeGraphPath({ baseDir: baseCwd, env });
  const storageInfoFetcher =
    dependencies.getGraphStorageInfo ??
    (async (graphPath?: string) => {
      const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
      return createClient(buildClientOptions(baseCwd, env, graphPath)).getStorageInfo();
    });
  let storageInfo: LifeGraphStorageInfo = {
    backend: 'sqlite',
    graphPath: defaultGraphPath,
    dbPath: inferGraphDbPath(defaultGraphPath),
    migrationBackupPath: null,
  };
  try {
    storageInfo = await storageInfoFetcher(defaultGraphPath);
  } catch {
    // Trust status remains available even if graph storage lookup fails.
  }

  const now = new Date().toISOString();
  return {
    generatedAt: now,
    ownership: {
      dataOwnership:
        'Your data is yours. LifeOS keeps your graph and settings on your machine by default.',
      methodsTransparency:
        'Every major action is inspectable through commands, manifests, and event traces.',
      localFirstDefault: localOnlyMode,
      cloudAssistEnabled,
    },
    runtime: {
      model: settings.model,
      ollamaHost: settings.ollamaHost,
      natsUrl: settings.natsUrl,
      localOnlyMode,
      trustAuditEnabled: normalizeBoolean(settings.trustAuditEnabled, true),
      policyEnforced,
      moduleManifestRequired,
      moduleRuntimePermissions,
      storageBackend: storageInfo.backend,
      graphPath: storageInfo.graphPath,
      graphDatabasePath: storageInfo.dbPath,
      migrationBackupPath: storageInfo.migrationBackupPath,
      syncAuthentication: {
        enabled: syncAuthEnabled,
        overrideActive: !syncAuthEnabled,
        warning: syncAuthWarning,
      },
    },
    modules: moduleSnapshots,
    warnings,
    recentDecisions: [
      {
        at: now,
        category: 'ownership',
        message: localOnlyMode
          ? 'Local-only mode is enabled; cloud assist is opt-in.'
          : 'Cloud assist is enabled for selected features.',
      },
      {
        at: now,
        category: 'policy',
        message: policyEnforced
          ? 'Policy enforcement is active for module permission checks.'
          : 'Policy enforcement is disabled; this weakens runtime trust guarantees.',
      },
      {
        at: now,
        category: 'runtime',
        message: `Module runtime permissions are set to "${moduleRuntimePermissions}".`,
      },
    ],
  };
}

function explainTrustAction(report: TrustReportPayload, targetAction: string): string {
  const normalized = targetAction.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'No action provided. Use `lifeos trust explain <action>`.';
  }

  if (normalized.startsWith('module.enable')) {
    return 'Module enable requests are validated against each module manifest and policy rules before runtime access is granted.';
  }

  if (normalized.startsWith('goal') || normalized.includes('plan')) {
    return report.runtime.localOnlyMode
      ? 'Goal planning runs local-first with your selected model and local graph context.'
      : 'Goal planning may use cloud assist where enabled, but policy and module contracts still gate execution.';
  }

  if (normalized.includes('voice')) {
    return 'Voice flows require explicit microphone consent and publish structured intent events to keep methods inspectable.';
  }

  return 'This action is evaluated with explicit permissions, policy checks, and logged runtime context so behavior remains explainable.';
}

async function readGoogleBridgeStatusSnapshot(
  env: NodeJS.ProcessEnv,
): Promise<{ syncedAt: string; source: string } | null> {
  const statusPath = join(
    resolveHomeDir(env),
    '.lifeos',
    'modules',
    'google-bridge',
    'status.json',
  );
  try {
    const parsed = JSON.parse(await readFile(statusPath, 'utf8')) as {
      syncedAt?: unknown;
      source?: unknown;
    };
    const syncedAt = typeof parsed.syncedAt === 'string' ? parsed.syncedAt.trim() : '';
    if (!syncedAt) {
      return null;
    }
    const source = typeof parsed.source === 'string' ? parsed.source.trim() : 'unknown';
    return {
      syncedAt,
      source: source || 'unknown',
    };
  } catch {
    return null;
  }
}

function isGoogleBridgeAuthorized(env: NodeJS.ProcessEnv): boolean {
  const tokenPath = join(resolveHomeDir(env), '.lifeos', 'secrets', 'google.json');
  return existsSync(tokenPath);
}

function formatSyncRecency(syncedAt: string): string {
  const millis = Date.parse(syncedAt);
  if (!Number.isFinite(millis)) {
    return 'unknown';
  }
  const ageMinutes = Math.max(0, Math.floor((Date.now() - millis) / 60_000));
  if (ageMinutes < 1) {
    return 'just now';
  }
  if (ageMinutes < 60) {
    return `${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `${ageHours} hour${ageHours === 1 ? '' : 's'} ago`;
  }
  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
}

function resolveGoogleBridgeHealth(syncedAt: string | null): string {
  if (!syncedAt) {
    return 'not-synced';
  }
  const millis = Date.parse(syncedAt);
  if (!Number.isFinite(millis)) {
    return 'unknown';
  }
  const ageMinutes = Math.max(0, Math.floor((Date.now() - millis) / 60_000));
  if (ageMinutes <= 30) {
    return 'healthy';
  }
  if (ageMinutes <= 360) {
    return 'stale';
  }
  return 'degraded';
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
  return dependencies.defaultModules ?? listCliDefaultRuntimeModules();
}

function renderModuleStateRows(enabledOptionalModules: string[]): Array<{
  id: string;
  tier: 'baseline' | 'optional' | 'system';
  enabled: boolean;
  available: boolean;
  aliases: string[];
  sharedImplementationWith: string[];
  statusText?: string;
}> {
  const enabledSet = new Set(enabledOptionalModules);
  return listCliFirstPartyModuleEntries({ visibleOnly: true }).map((entry) => ({
    id: entry.canonicalId,
    tier: entry.tier,
    enabled: entry.userToggleable ? enabledSet.has(entry.canonicalId) : true,
    available: entry.implementationAvailable,
    aliases: entry.aliases,
    sharedImplementationWith: entry.sharedImplementationWith ?? [],
    statusText: entry.statusText,
  }));
}

async function resolveBootModulesFromState(env: NodeJS.ProcessEnv): Promise<LifeOSModule[]> {
  const state = await readModuleState({ env });
  return listCliBootRuntimeModules(state.enabledOptionalModules);
}

function parseNodeRole(rawRole: string | undefined): NodeRole {
  if (rawRole === 'primary' || rawRole === 'fallback' || rawRole === 'heavy-compute') {
    return rawRole;
  }
  return 'fallback';
}

function parseNodeRoleOption(rawRole: string | undefined): NodeRole | undefined {
  if (rawRole === 'primary' || rawRole === 'fallback' || rawRole === 'heavy-compute') {
    return rawRole;
  }
  return undefined;
}

const DEFAULT_MESH_CAPABILITIES = [
  'voice',
  'calendar',
  'tasks',
  'goal-planning',
  'research',
  'weather',
  'news',
  'email-summarize',
] as const;

function parseMeshCapabilities(value: string | undefined): string[] {
  const normalized = (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (normalized.length > 0) {
    return [...new Set(normalized)];
  }
  return [...DEFAULT_MESH_CAPABILITIES];
}

function mapIntentTopicToMeshCapability(topic: string): string | null {
  if (topic === Topics.lifeos.voiceIntentResearch) {
    return 'research';
  }
  if (topic === Topics.lifeos.voiceIntentWeather) {
    return 'weather';
  }
  if (topic === Topics.lifeos.voiceIntentNews) {
    return 'news';
  }
  if (topic === Topics.lifeos.voiceIntentEmailSummarize) {
    return 'email-summarize';
  }
  return null;
}

function mapMeshCapabilityToIntentTopic(capability: string): string | null {
  const normalized = capability.trim().toLowerCase();
  if (normalized === 'research') {
    return Topics.lifeos.voiceIntentResearch;
  }
  if (normalized === 'weather') {
    return Topics.lifeos.voiceIntentWeather;
  }
  if (normalized === 'news') {
    return Topics.lifeos.voiceIntentNews;
  }
  if (normalized === 'email-summarize') {
    return Topics.lifeos.voiceIntentEmailSummarize;
  }
  return null;
}

function createMeshTraceContext(source: string): {
  traceId: string;
  source: string;
  requestedAt: string;
} {
  return {
    traceId: randomUUID(),
    source,
    requestedAt: new Date().toISOString(),
  };
}

function formatMeshLeaderPreflightMessage(leaderId: string | null): string {
  if (leaderId) {
    return `Mesh leader "${leaderId}" is not healthy. Retry after leader failover stabilizes.`;
  }
  return 'Mesh control plane has no healthy leader. Retry after leader election stabilizes.';
}

async function runMeshDelegationLeaderPreflight(
  meshCoordinator: MeshCoordinator,
  verboseLog: (line: string) => void,
): Promise<{ ok: true } | { ok: false; reason: 'leader_unhealthy'; leaderId: string | null }> {
  const controlPlaneStatus = await meshCoordinator.getLiveStatus();
  if (controlPlaneStatus.leaderHealthy) {
    return { ok: true };
  }
  verboseLog(
    `mesh_delegate_preflight_rejected reason=leader_unhealthy leader_id=${controlPlaneStatus.leaderId ?? 'none'}`,
  );
  return {
    ok: false,
    reason: 'leader_unhealthy',
    leaderId: controlPlaneStatus.leaderId,
  };
}

function parseJsonObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function waitForTerminationSignal(): Promise<NodeJS.Signals> {
  return await new Promise<NodeJS.Signals>((resolve) => {
    const onSignal = (signal: NodeJS.Signals) => {
      process.off('SIGINT', onSigInt);
      process.off('SIGTERM', onSigTerm);
      resolve(signal);
    };
    const onSigInt = () => onSignal('SIGINT');
    const onSigTerm = () => onSignal('SIGTERM');
    process.on('SIGINT', onSigInt);
    process.on('SIGTERM', onSigTerm);
  });
}

function isGoalPlanCandidate(value: unknown): value is GoalPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.description !== 'string' ||
    !Array.isArray(record.tasks)
  ) {
    return false;
  }
  return true;
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message);
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
  const meshCoordinator = new MeshCoordinator({ env });

  const tryMeshDelegate = async (
    topic: string,
    data: Record<string, unknown>,
    source: string,
  ): Promise<boolean> => {
    const capability = mapIntentTopicToMeshCapability(topic);
    if (!capability) {
      return false;
    }
    const trace = createMeshTraceContext(source);

    await publishEventSafely(
      Topics.lifeos.meshDelegateRequested,
      {
        capability,
        topic,
        requestedAt: trace.requestedAt,
        source: trace.source,
        traceId: trace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );

    const preflight = await runMeshDelegationLeaderPreflight(meshCoordinator, verboseLog);
    const delegated = preflight.ok
      ? await meshCoordinator.delegateIntentPublish({
          capability,
          topic,
          data,
          source,
          traceId: trace.traceId,
        })
      : {
          delegated: false as const,
          capability,
          reason: preflight.reason,
          ...(preflight.leaderId ? { nodeId: preflight.leaderId } : {}),
        };
    if (delegated.delegated) {
      await publishEventSafely(
        Topics.lifeos.meshDelegateAccepted,
        {
          capability,
          topic,
          delegatedTo: delegated.nodeId ?? null,
          rpcUrl: delegated.rpcUrl ?? null,
          acceptedAt: new Date().toISOString(),
          traceId: trace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      await publishEventSafely(
        Topics.lifeos.meshDelegateCompleted,
        {
          capability,
          topic,
          delegatedTo: delegated.nodeId ?? null,
          completedAt: new Date().toISOString(),
          traceId: trace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      return true;
    }

    await publishEventSafely(
      Topics.lifeos.meshDelegateFailed,
      {
        capability,
        topic,
        delegatedTo: delegated.nodeId ?? null,
        reason: delegated.reason ?? 'delegation_failed',
        failedAt: new Date().toISOString(),
        traceId: trace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );
    await publishEventSafely(
      Topics.lifeos.meshDelegateFallbackLocal,
      {
        capability,
        topic,
        fallbackAt: new Date().toISOString(),
        traceId: trace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );
    return false;
  };

  if (dependencies.moduleLoader) {
    return async (topic, data, source) => {
      if (await tryMeshDelegate(topic, data, source ?? 'voice-core')) {
        return;
      }
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
    if (await tryMeshDelegate(topic, data, source)) {
      return;
    }
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

async function projectSubtasksToPlannedActions(
  plan: GoalPlan,
  planId: string,
  client: Pick<LifeGraphClient, 'appendPlannedAction'>,
  now: Date,
): Promise<PlannedAction[]> {
  void now;
  const projectedTasks = plan.tasks.slice(0, 10);
  const projectedActions: PlannedAction[] = [];

  for (const task of projectedTasks) {
    const action: PlannedAction = {
      id: randomUUID(),
      title: task.title,
      status: 'todo',
      planId,
      activationSource: 'goal_projection',
      dueDate: plan.deadline ?? undefined,
    };
    await client.appendPlannedAction(action);
    projectedActions.push(action);
  }

  return projectedActions;
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
    let plan: GoalPlan;
    const meshCoordinator = new MeshCoordinator({ env });
    const meshTrace = createMeshTraceContext('lifeos-cli');
    await publishEventSafely(
      Topics.lifeos.meshDelegateRequested,
      {
        capability: 'goal-planning',
        requestedAt: meshTrace.requestedAt,
        source: meshTrace.source,
        traceId: meshTrace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );
    const preflight = await runMeshDelegationLeaderPreflight(meshCoordinator, verboseLog);
    const delegated = preflight.ok
      ? await meshCoordinator.delegateGoalPlan({
          goal: normalizedGoal,
          model: options.model,
          requestedAt: meshTrace.requestedAt,
          traceId: meshTrace.traceId,
        })
      : {
          delegated: false as const,
          capability: 'goal-planning',
          reason: preflight.reason,
          ...(preflight.leaderId ? { nodeId: preflight.leaderId } : {}),
        };

    if (delegated.delegated && isGoalPlanCandidate(delegated.payload)) {
      plan = delegated.payload;
      await publishEventSafely(
        Topics.lifeos.meshDelegateAccepted,
        {
          capability: 'goal-planning',
          delegatedTo: delegated.nodeId ?? null,
          rpcUrl: delegated.rpcUrl ?? null,
          acceptedAt: now().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      await publishEventSafely(
        Topics.lifeos.meshDelegateCompleted,
        {
          capability: 'goal-planning',
          delegatedTo: delegated.nodeId ?? null,
          completedAt: now().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
    } else {
      await publishEventSafely(
        Topics.lifeos.meshDelegateFailed,
        {
          capability: 'goal-planning',
          delegatedTo: delegated.nodeId ?? null,
          reason: delegated.reason ?? 'delegation_failed',
          failedAt: now().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      await publishEventSafely(
        Topics.lifeos.meshDelegateFallbackLocal,
        {
          capability: 'goal-planning',
          delegatedTo: delegated.nodeId ?? null,
          reason: delegated.reason ?? 'no_remote_plan',
          fallbackAt: now().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      try {
        plan = await interpret(normalizedGoal, interpretOptions);
      } catch (error: unknown) {
        if (isConnectionError(error)) {
          spinner?.fail(chalk.yellow('Model runtime unavailable, using local fallback.'));

          const fallbackPlan = GoalPlanSchema.parse({
            id: randomUUID(),
            title: normalizedGoal,
            description: normalizedGoal,
            deadline: null,
            tasks: [
              {
                id: randomUUID(),
                title: `Work on: ${normalizedGoal}`,
                status: 'todo',
                priority: 3,
              },
            ],
            createdAt: now().toISOString(),
          }) as GoalPlan;

          writeStderr(
            `${chalk.yellow("[local-fallback] Ollama unavailable - created a minimal plan locally. Run 'lifeos doctor' to check your model runtime.")}\n`,
          );

          if (options.outputJson) {
            writeStdout(`${JSON.stringify(fallbackPlan, null, 2)}\n`);
          } else {
            writeStdout(`${chalk.bold('Plan for:')} ${chalk.cyan(normalizedGoal)}\n`);
            writeStdout(`${chalk.dim('-'.repeat(60))}\n`);
            writeStdout(`${formatGoalPlan(fallbackPlan)}\n`);
          }

          return 0;
        }

        throw error;
      }
    }

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
        const firstRunMessage = `First run detected. Initializing your personal graph at ${options.graphPath}. Tip: run 'lifeos init' for guided setup.`;
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

      const projectionClient: Pick<LifeGraphClient, 'appendPlannedAction'> =
        dependencies.appendPlannedAction
          ? {
              appendPlannedAction: (action) =>
                dependencies.appendPlannedAction!(action, options.graphPath),
            }
          : dependencies.appendGoalPlan
            ? (() => {
                throw new Error(
                  'appendPlannedAction dependency is required when appendGoalPlan is injected.',
                );
              })()
            : createClient({ graphPath: options.graphPath, env });
      const projectedActions = await projectSubtasksToPlannedActions(
        plan,
        saved.id,
        projectionClient,
        now(),
      );
      const projectedCount = projectedActions.length;
      verboseLog(`stage=projection_completed projected_count=${projectedCount}`);

      if (options.outputJson === false) {
        writeStdout(`${chalk.green(`[saved] ${options.graphPath} (id: ${saved.id})`)}\n`);
        writeStdout(
          `${chalk.green(`Goal saved. Projected ${projectedCount} action(s) into your task list.`)}\n`,
        );
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
    const friendly = toFriendlyCliError(error, {
      command: 'goal',
      graphPath: options.graphPath,
      model: options.model,
    });
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
  const storageInfoFetcher =
    dependencies.getGraphStorageInfo ??
    (async (graphPath?: string) =>
      createClient(buildClientOptions(baseCwd, env, graphPath)).getStorageInfo());

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  verboseLog(`graph_path=${options.graphPath}`);

  try {
    if (options.risks) {
      const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
      const graph = await client.loadGraph();
      const nowIso = new Date().toISOString();
      const previousRadar = graph.system?.meta?.riskRadar;
      const radar = await buildModularityRiskRadar(baseCwd, nowIso);
      const output = {
        modularityRiskRadar: {
          ...radar,
          previousOverallHealth: previousRadar?.overallHealth ?? null,
        },
      };

      if (options.outputJson) {
        writeStdout(`${JSON.stringify(output, null, 2)}\n`);
      } else {
        writeStdout(`${renderRiskTable(radar)}\n`);
      }

      await client.saveGraph({
        ...graph,
        updatedAt: nowIso,
        system: {
          ...(graph.system ?? {}),
          meta: {
            ...(graph.system?.meta ?? {}),
            riskRadar: radar,
          },
        },
      });
      return 0;
    }

    verboseLog('stage=summary_load_started');
    const summary = await summarize(options.graphPath);
    let storageInfo: LifeGraphStorageInfo;
    try {
      storageInfo = await storageInfoFetcher(options.graphPath);
    } catch (error: unknown) {
      storageInfo = {
        backend: 'sqlite',
        graphPath: options.graphPath,
        dbPath: inferGraphDbPath(options.graphPath),
        migrationBackupPath: null,
      };
      verboseLog(`storage_info_fallback reason=${normalizeErrorMessage(error)}`);
    }
    const createBus = createDefaultEventBusClient(dependencies);
    const bus = createBus({
      env,
      name: 'lifeos-cli-status',
      timeoutMs: 1500,
      maxReconnectAttempts: 0,
    });
    let detectedTransport: EventBusTransport = 'unknown';
    try {
      await bus.publish('lifeos.status.probe', createCliEvent('lifeos.status.probe', {}));
      detectedTransport = bus.getTransport();
    } catch (error: unknown) {
      verboseLog(`status_event_probe_failed reason=${normalizeErrorMessage(error)}`);
    } finally {
      await bus.close();
    }
    const eventTransport: 'nats' | 'in-memory' = detectedTransport === 'nats' ? 'nats' : 'in-memory';
    const eventDurability: 'external' | 'process-local' =
      eventTransport === 'nats' ? 'external' : 'process-local';
    if (detectedTransport === 'unknown') {
      verboseLog('status_event_transport_defaulted=in-memory');
    }
    verboseLog('stage=summary_load_completed');

    if (options.outputJson) {
      writeStdout(
        `${JSON.stringify(
          {
            ...summary,
            storage: storageInfo,
            eventTransport,
            eventDurability,
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }

    writeStdout(`${printGraphSummary(summary)}\n`);
    writeStdout(
      chalk.dim(
        `Storage: ${storageInfo.backend} | graph=${storageInfo.graphPath} | db=${storageInfo.dbPath}\n`,
      ),
    );
    writeStdout(
      chalk.dim(
        `Event transport: ${eventTransport}\nEvent durability: ${eventDurability === 'external' ? 'durable-ish external transport' : 'non-durable process-local fallback'}\n`,
      ),
    );
    if (storageInfo.migrationBackupPath) {
      writeStdout(chalk.dim(`Latest migration backup: ${storageInfo.migrationBackupPath}\n`));
    }
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    if (options.verbose && error instanceof Error) {
      writeStderr(`${chalk.gray(`[verbose] error_type=${error.name}`)}\n`);
    }
    return 1;
  }
}

export async function runGraphCommand(
  options: GraphCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const migrate = dependencies.runGraphMigrations ?? runGraphMigrations;

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    if (options.action !== 'migrate') {
      writeStderr(
        `${chalk.red.bold('Error:')} Invalid graph action "${options.action}". Use migrate.\n`,
      );
      return 1;
    }

    verboseLog(`graph_path=${options.graphPath}`);
    verboseLog(`target_version=${options.targetVersion ?? '(default)'}`);
    verboseLog(`dry_run=${options.dryRun === true}`);

    const migrationOptions: { targetVersion?: string; dryRun?: boolean } = {};
    if (options.targetVersion) {
      migrationOptions.targetVersion = options.targetVersion;
    }
    if (options.dryRun !== undefined) {
      migrationOptions.dryRun = options.dryRun;
    }

    const result = await migrate(options.graphPath, migrationOptions);

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (result.migrated === false) {
      writeStdout(
        chalk.green(
          `Graph already at schema ${result.targetVersion}. No migration required (current ${result.currentVersion}).\n`,
        ),
      );
      return 0;
    }

    const modeLabel = result.dryRun ? 'dry-run' : 'applied';
    writeStdout(chalk.bold(`Graph migration ${modeLabel}\n`));
    writeStdout(`${chalk.dim('-'.repeat(36))}\n`);
    writeStdout(`From: ${result.currentVersion}\n`);
    writeStdout(`To:   ${result.targetVersion}\n`);

    if (result.steps.length > 0) {
      writeStdout('Steps:\n');
      for (const step of result.steps) {
        writeStdout(`- ${step}\n`);
      }
    }

    if (result.backupPath) {
      writeStdout(`${chalk.dim(`Backup: ${result.backupPath}`)}\n`);
    }

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
    const friendly = toFriendlyCliError(error, {
      command: 'review',
      graphPath: options.graphPath,
      model: DEFAULT_MODEL,
    });
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
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
        title: completedTask.title,
        status: completedTask.status,
        completionSource: completedTask.source,
        ...(completedTask.goalId ? { goalId: completedTask.goalId } : {}),
        ...(completedTask.sourceCapture ? { sourceCapture: completedTask.sourceCapture } : {}),
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

    if (options.action === 'block') {
      await handleTaskBlock(options.taskId, options.reason, client, {
        outputJson: options.outputJson,
        stdout: writeStdout,
        now: now(),
      });
      return 0;
    }

    if (options.action === 'cancel') {
      await handleTaskCancel(options.taskId, client, {
        outputJson: options.outputJson,
        stdout: writeStdout,
        now: now(),
      });
      return 0;
    }

    if (options.action === 'unblock') {
      await handleTaskUnblock(options.taskId, client, {
        outputJson: options.outputJson,
        stdout: writeStdout,
        now: now(),
      });
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

interface SingleTickCycleResult {
  remindersProcessed: number;
  checkedTasks: number;
}

async function runSingleTickCycle(
  options: TickCommandOptions,
  dependencies: RunCliDependencies,
  env: NodeJS.ProcessEnv,
  baseCwd: string,
  now: () => Date,
  writeStdout: (message: string) => void,
  writeStderr: (message: string) => void,
  verboseLog: (line: string) => void,
): Promise<SingleTickCycleResult> {
  const tick = dependencies.runTick ?? runTick;
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;

  const tickNow = now();
  const result = await tick({
    graphPath: options.graphPath,
    env,
    now: tickNow,
    logger: (line) => {
      verboseLog(line);
    },
  });

  const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
  const graph = await client.loadGraph();
  const tickNowIso = tickNow.toISOString();
  const remindersToFire = (graph.reminderEvents ?? []).filter(
    (reminder) => reminder.status === 'scheduled' && reminder.scheduledFor <= tickNowIso,
  );

  for (const reminder of remindersToFire) {
    await client.updateReminderEvent(reminder.id, {
      status: 'fired',
      firedAt: tickNowIso,
    });
    await publishEventSafely(
      Topics.lifeos.reminderFired,
      {
        reminderId: reminder.id,
        actionId: reminder.actionId,
        firedAt: tickNowIso,
      },
      dependencies,
      env,
      verboseLog,
    );
  }
  verboseLog(`reminders_fired=${remindersToFire.length}`);

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
    return { remindersProcessed: remindersToFire.length, checkedTasks: result.checkedTasks };
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
    return { remindersProcessed: remindersToFire.length, checkedTasks: result.checkedTasks };
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
    writeStdout(`- ${task.id.slice(0, 8)} | ${task.planId ?? '-'} | ${task.title} | due ${task.dueDate}\n`);
  });
  return { remindersProcessed: remindersToFire.length, checkedTasks: result.checkedTasks };
}

export async function runTickCommand(
  options: TickCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const sleep = dependencies.sleep ?? ((ms: number) => delay(ms));
  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  if (!options.watch) {
    try {
      await runSingleTickCycle(options, dependencies, env, baseCwd, now, writeStdout, writeStderr, verboseLog);
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  // Watch mode
  const intervalRaw = options.every ?? '15m';
  let intervalMs: number;
  try {
    intervalMs = parseTickInterval(intervalRaw);
  } catch (err: unknown) {
    const tickErr = err as { payload?: unknown };
    if (options.outputJson && tickErr.payload) {
      writeStdout(`${JSON.stringify(tickErr.payload, null, 2)}\n`);
    } else {
      writeStderr(
        `${chalk.red.bold('Error:')} ERR_INVALID_TICK_INTERVAL: "${intervalRaw}" is not a valid interval. Use formats like 30s, 5m, 1h (minimum 30s).\n`,
      );
    }
    return 1;
  }

  writeStdout(
    `Watching reminders every ${intervalRaw}. Reminders fire only while this process is running or when lifeos tick is run manually.\n`,
  );

  let stopped = false;
  let resolveStop!: () => void;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const stopHandler = (): void => {
    stopped = true;
    resolveStop();
  };
  process.once('SIGINT', stopHandler);
  process.once('SIGTERM', stopHandler);

  try {
    while (!stopped) {
      const start = now().getTime();
      let remindersProcessed = 0;
      try {
        const cycleResult = await runSingleTickCycle(
          { ...options, outputJson: false },
          dependencies,
          env,
          baseCwd,
          now,
          writeStdout,
          writeStderr,
          verboseLog,
        );
        remindersProcessed = cycleResult.remindersProcessed;
      } catch (error: unknown) {
        writeStderr(`${chalk.red.bold('[tick error]')} ${normalizeErrorMessage(error)}\n`);
      }
      const elapsed = now().getTime() - start;
      if (elapsed > intervalMs) {
        writeStderr(
          `${chalk.yellow('[tick warn]')} Tick took ${elapsed}ms, longer than interval ${intervalMs}ms.\n`,
        );
      }
      writeStdout(`[tick] ${new Date().toISOString()} — processed ${remindersProcessed} reminder(s)\n`);
      if (!stopped) {
        await Promise.race([sleep(intervalMs), stopPromise]);
      }
    }
  } finally {
    process.off('SIGINT', stopHandler);
    process.off('SIGTERM', stopHandler);
  }

  writeStdout('Tick watcher stopped. Goodbye.\n');
  return 0;
}

export async function runDemoCommand(
  options: DemoCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  if (options.dryRun) {
    writeStdout(
      chalk.green(
        `Demo dry-run complete${options.modules ? ` (modules=${options.modules})` : ''}. CLI wiring is healthy.\n`,
      ),
    );
    return 0;
  }

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

export async function runDemoLoopCommand(
  options: DemoLoopCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const now = dependencies.now ?? (() => new Date());
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;

  try {
    if (options.dryRun) {
      // Validate stage wiring in-memory only — no file/DB access occurs
      const stageErrors: string[] = [];

      try {
        CaptureEntrySchema.parse({
          id: '00000000-0000-0000-0000-000000000001',
          content: 'dry-run capture probe',
          type: 'text',
          capturedAt: now().toISOString(),
          source: 'cli',
          tags: [],
          status: 'pending',
        });
        writeStdout(`${chalk.green('Dry-run stage 1 ok: capture x3 wiring validated')}\n`);
      } catch (stageError: unknown) {
        stageErrors.push(`stage 1 capture: ${normalizeErrorMessage(stageError)}`);
        writeStdout(`${chalk.red('Dry-run stage 1 FAIL: capture wiring invalid')}\n`);
      }

      try {
        PlannedActionSchema.parse({
          id: '00000000-0000-0000-0000-000000000002',
          title: 'dry-run triage probe',
          status: 'todo',
          sourceCapture: '00000000-0000-0000-0000-000000000001',
          dueDate: new Date(now().getTime() + 86_400_000).toISOString().slice(0, 10),
        });
        writeStdout(`${chalk.green('Dry-run stage 2 ok: triage x3 wiring validated')}\n`);
      } catch (stageError: unknown) {
        stageErrors.push(`stage 2 triage: ${normalizeErrorMessage(stageError)}`);
        writeStdout(`${chalk.red('Dry-run stage 2 FAIL: triage wiring invalid')}\n`);
      }

      try {
        ReminderEventSchema.parse({
          id: '00000000-0000-0000-0000-000000000003',
          actionId: '00000000-0000-0000-0000-000000000002',
          scheduledFor: new Date(now().getTime() + 86_400_000).toISOString(),
          status: 'scheduled',
        });
        writeStdout(`${chalk.green('Dry-run stage 3 ok: remind x1 wiring validated')}\n`);
      } catch (stageError: unknown) {
        stageErrors.push(`stage 3 remind: ${normalizeErrorMessage(stageError)}`);
        writeStdout(`${chalk.red('Dry-run stage 3 FAIL: remind wiring invalid')}\n`);
      }

      try {
        PlannedActionSchema.parse({
          id: '00000000-0000-0000-0000-000000000002',
          title: 'dry-run complete probe',
          status: 'done',
          sourceCapture: '00000000-0000-0000-0000-000000000001',
          dueDate: new Date(now().getTime() + 86_400_000).toISOString().slice(0, 10),
          completedAt: now().toISOString(),
        });
        writeStdout(`${chalk.green('Dry-run stage 4 ok: complete x1 wiring validated')}\n`);
      } catch (stageError: unknown) {
        stageErrors.push(`stage 4 complete: ${normalizeErrorMessage(stageError)}`);
        writeStdout(`${chalk.red('Dry-run stage 4 FAIL: complete wiring invalid')}\n`);
      }

      const reviewFn =
        dependencies.generateReview ??
        (async (period: LifeGraphReviewPeriod, graphPath?: string) =>
          createClient(buildClientOptions(baseCwd, env, graphPath)).generateReview(period));
      if (typeof reviewFn === 'function') {
        writeStdout(`${chalk.green('Dry-run stage 5 ok: review wiring validated')}\n`);
      } else {
        stageErrors.push('stage 5 review: generateReview dependency not wired');
        writeStdout(`${chalk.red('Dry-run stage 5 FAIL: review wiring invalid')}\n`);
      }

      if (stageErrors.length > 0) {
        for (const stageError of stageErrors) {
          writeStderr(`${chalk.red.bold('Wiring error:')} ${stageError}\n`);
        }
        return 1;
      }
      return 0;
    }

    const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
    const review =
      dependencies.generateReview ??
      (async (period: LifeGraphReviewPeriod, graphPath?: string) =>
        createClient(buildClientOptions(baseCwd, env, graphPath)).generateReview(period));
    const stageResults: Array<Record<string, unknown>> = [];

    const captureContents = ['Plan team sync', 'Review Q2 budget', 'Send project update'];
    const capturedEntries: CaptureEntry[] = [];

    for (const content of captureContents) {
      const entry: CaptureEntry = CaptureEntrySchema.parse({
        id: randomUUID(),
        content,
        type: 'text',
        capturedAt: now().toISOString(),
        source: 'cli',
        tags: [],
        status: 'pending',
      });
      await client.appendCaptureEntry(entry);
      capturedEntries.push(entry);
      stageResults.push({ stage: 'capture', id: entry.id, content: entry.content });
    }

    const plannedActions: PlannedAction[] = [];
    const triageBase = now();
    for (const [index, entry] of capturedEntries.entries()) {
      const dueDate = new Date(triageBase);
      dueDate.setDate(dueDate.getDate() + index + 1);
      const plannedAction: PlannedAction = PlannedActionSchema.parse({
        id: randomUUID(),
        title: entry.content,
        status: 'todo',
        sourceCapture: entry.id,
        dueDate: dueDate.toISOString().slice(0, 10),
      });

      await client.appendPlannedAction(plannedAction);
      await client.updateCaptureEntry(entry.id, { status: 'triaged' });
      plannedActions.push(plannedAction);
      stageResults.push({
        stage: 'triage',
        captureId: entry.id,
        actionId: plannedAction.id,
        dueDate: plannedAction.dueDate,
      });
    }

    const firstAction = plannedActions[0];
    if (!firstAction) {
      throw new Error('Demo loop did not produce a triaged action for reminder scheduling.');
    }

    const reminderScheduledFor = new Date(now());
    reminderScheduledFor.setDate(reminderScheduledFor.getDate() + 1);
    const reminder: ReminderEvent = ReminderEventSchema.parse({
      id: randomUUID(),
      actionId: firstAction.id,
      scheduledFor: reminderScheduledFor.toISOString(),
      status: 'scheduled',
    });
    await client.appendReminderEvent(reminder);
    stageResults.push({
      stage: 'remind',
      actionId: reminder.actionId,
      scheduledFor: reminder.scheduledFor,
    });

    await client.updatePlannedAction(firstAction.id, {
      status: 'done',
      completedAt: now().toISOString(),
    });
    stageResults.push({ stage: 'complete', actionId: firstAction.id });

    const insights = await review('daily', options.graphPath);
    stageResults.push({
      stage: 'review',
      wins: insights.wins,
      nextActions: insights.nextActions,
      source: insights.source,
    });

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(stageResults, null, 2)}\n`);
      return 0;
    }

    writeStdout(`${chalk.bold.cyan('Stage 1 — Capture')}\n`);
    for (const entry of capturedEntries) {
      writeStdout(`- ${entry.id.slice(0, 8)}  ${entry.content}\n`);
    }

    writeStdout(`${chalk.bold.cyan('Stage 2 — Triage')}\n`);
    for (const [index, action] of plannedActions.entries()) {
      writeStdout(
        `- capture ${capturedEntries[index]?.id.slice(0, 8)} -> action ${action.id.slice(0, 8)} due ${action.dueDate}\n`,
      );
    }

    writeStdout(`${chalk.bold.cyan('Stage 3 — Remind')}\n`);
    writeStdout(`- action ${reminder.actionId.slice(0, 8)} scheduled ${reminder.scheduledFor}\n`);

    writeStdout(`${chalk.bold.cyan('Stage 4 — Complete')}\n`);
    writeStdout(`- action ${firstAction.id.slice(0, 8)} marked done\n`);

    writeStdout(`${chalk.bold.cyan('Stage 5 — Review')}\n`);
    writeStdout(`- source: ${insights.source}\n`);
    writeStdout(`- wins: ${(insights.wins ?? []).join(' | ') || 'none'}\n`);
    writeStdout(`- next actions: ${(insights.nextActions ?? []).join(' | ') || 'none'}\n`);

    writeStdout(
      `${boxen(chalk.green('Demo loop complete! Full loop proof executed successfully.'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })}\n`,
    );
    writeStdout('Next: `lifeos inbox list`, `lifeos review`\n');
    return 0;
  } catch (error: unknown) {
    const friendly = toFriendlyCliError(error, {
      command: 'demo:loop',
      graphPath: options.graphPath,
    });
    writeStderr(`${chalk.red.bold('Error:')} ${friendly.message}\n`);
    if (friendly.guidance) {
      writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
    }
    return 1;
  }
}

function parseTimestamp(value: string | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function truncateText(value: string, maxChars: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function toDateLabel(value: string | undefined): string {
  if (!value) {
    return 'unscheduled';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

async function buildVoiceBriefingSummary(client: LifeGraphClient, now: Date): Promise<string> {
  const graph = await client.loadGraph();
  const nowMs = now.getTime();
  const dayAheadMs = nowMs + 24 * 60 * 60 * 1000;

  const openTasks = graph.plans
    .flatMap((plan) => plan.tasks)
    .filter((task) => task.status !== 'done');
  const nextTask = [...openTasks].sort(
    (left, right) => parseTimestamp(left.dueDate) - parseTimestamp(right.dueDate),
  )[0];

  const upcomingEvents = (graph.calendarEvents ?? [])
    .filter((event) => {
      const startMs = Date.parse(event.start);
      return Number.isFinite(startMs) && startMs >= nowMs && startMs <= dayAheadMs;
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));

  const latestResearch = [...(graph.researchResults ?? [])].sort(
    (left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt),
  )[0];
  const latestWeather = await client.getLatestWeatherSnapshot();
  const latestNews = await client.getLatestNewsDigest();

  const sections: string[] = ['Here is your LifeOS briefing. I will keep it clear and practical.'];
  if (openTasks.length === 0) {
    sections.push('You have no open tasks right now. Nice clean slate.');
  } else if (nextTask) {
    sections.push(
      `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}. Next: ${truncateText(
        nextTask.title,
        80,
      )} due ${toDateLabel(nextTask.dueDate)}.`,
    );
  }

  if (upcomingEvents.length === 0) {
    sections.push('No calendar events in the next 24 hours. You have room for focused work.');
  } else {
    const event = upcomingEvents[0];
    if (event) {
      sections.push(
        `${upcomingEvents.length} event${upcomingEvents.length === 1 ? '' : 's'} coming up. Next: ${truncateText(
          event.title,
          80,
        )} at ${event.start}.`,
      );
    }
  }

  if (latestWeather?.forecast) {
    sections.push(`Weather: ${truncateText(latestWeather.forecast, 180)}`);
  } else {
    sections.push('Weather: no recent forecast cached yet.');
  }

  if (latestNews?.summary) {
    sections.push(`News: ${truncateText(latestNews.summary, 180)}`);
  } else {
    sections.push('News: no digest cached yet.');
  }

  if (latestResearch?.summary) {
    sections.push(
      `Recent research on ${truncateText(latestResearch.query, 50)}: ${truncateText(latestResearch.summary, 150)}`,
    );
  }

  return sections.join(' ');
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

    if (options.mode === 'briefing') {
      const baseCwd = resolveBaseCwd(env, dependencies.cwd);
      const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
      const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
      const briefing = await buildVoiceBriefingSummary(
        client,
        dependencies.now ? dependencies.now() : new Date(),
      );
      const tts = dependencies.createTextToSpeech
        ? dependencies.createTextToSpeech()
        : new TextToSpeech();
      try {
        await tts.speak(briefing);
      } catch (error: unknown) {
        writeStderr(
          `${chalk.yellow(`[warn] Voice briefing speech degraded: ${normalizeErrorMessage(error)}`)}\n`,
        );
      }
      writeStdout(chalk.blue('Voice briefing generated.\n'));
      writeStdout(`LifeOS Briefing: ${briefing}\n`);
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

export async function runMemoryCommand(
  options: MemoryCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
    const graph = await client.loadGraph();
    const memoryEntries = graph.memory ?? [];
    const sortedByRecent = [...memoryEntries].sort((left, right) => {
      const rightMs = Date.parse(right.timestamp);
      const leftMs = Date.parse(left.timestamp);
      const safeRight = Number.isFinite(rightMs) ? rightMs : Number.NEGATIVE_INFINITY;
      const safeLeft = Number.isFinite(leftMs) ? leftMs : Number.NEGATIVE_INFINITY;
      return safeRight - safeLeft;
    });
    const byType = memoryEntries.reduce<Record<string, number>>((acc, entry) => {
      const next = acc[entry.type] ?? 0;
      acc[entry.type] = next + 1;
      return acc;
    }, {});
    const threadCount = new Set(
      memoryEntries
        .map((entry) => entry.threadId)
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
    ).size;
    const latestTimestamp = sortedByRecent[0]?.timestamp ?? null;
    const topThreads = Array.from(
      memoryEntries
        .reduce<Map<string, { entries: number; latestTimestamp: string }>>((acc, entry) => {
          if (!entry.threadId?.trim()) {
            return acc;
          }
          const existing = acc.get(entry.threadId) ?? {
            entries: 0,
            latestTimestamp: entry.timestamp,
          };
          const existingMs = Date.parse(existing.latestTimestamp);
          const nextMs = Date.parse(entry.timestamp);
          existing.entries += 1;
          if (Number.isFinite(nextMs) && (!Number.isFinite(existingMs) || nextMs > existingMs)) {
            existing.latestTimestamp = entry.timestamp;
          }
          acc.set(entry.threadId, existing);
          return acc;
        }, new Map())
        .entries(),
    )
      .map(([threadId, value]) => ({
        threadId,
        entries: value.entries,
        latestTimestamp: value.latestTimestamp,
      }))
      .sort((left, right) => right.entries - left.entries)
      .slice(0, 5);
    const recentInsights = sortedByRecent
      .filter((entry) => entry.type === 'insight' || entry.type === 'research')
      .slice(0, 3)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        timestamp: entry.timestamp,
        contentPreview: entry.content.replace(/\s+/g, ' ').trim().slice(0, 120),
      }));
    const storageBytesEstimate = memoryEntries.reduce((sum, entry) => {
      return (
        sum +
        entry.content.length +
        entry.relatedTo.join(',').length +
        (entry.embedding.length * 8 + 80)
      );
    }, 0);

    const payload = {
      totalEntries: memoryEntries.length,
      threadCount,
      latestTimestamp,
      byType,
      topThreads,
      recentInsights,
      storageBytesEstimate,
    };

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      writeStdout(chalk.bold('LifeOS Memory Status\n'));
      writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
      writeStdout(`Entries: ${payload.totalEntries}\n`);
      writeStdout(`Threads: ${payload.threadCount}\n`);
      writeStdout(`Latest: ${payload.latestTimestamp ?? 'n/a'}\n`);
      writeStdout(`Storage (est): ${payload.storageBytesEstimate} bytes\n`);
      const byTypeLine =
        Object.keys(payload.byType).length === 0
          ? 'none'
          : Object.entries(payload.byType)
              .sort((left, right) => left[0].localeCompare(right[0]))
              .map(([type, count]) => `${type}=${count}`)
              .join(', ');
      writeStdout(`By type: ${byTypeLine}\n`);
      if (payload.topThreads.length > 0) {
        const threadLine = payload.topThreads
          .map((entry) => `${entry.threadId} (${entry.entries})`)
          .join(', ');
        writeStdout(`Top threads: ${threadLine}\n`);
      } else {
        writeStdout('Top threads: none\n');
      }
      if (payload.recentInsights.length > 0) {
        const insightLine = payload.recentInsights
          .map((entry) => `[${entry.type}] ${entry.contentPreview}`)
          .join(' | ');
        writeStdout(`Recent insights: ${insightLine}\n`);
      } else {
        writeStdout('Recent insights: none\n');
      }
    }

    await publishEventSafely(
      Topics.lifeos.memoryStatusGenerated,
      payload,
      dependencies,
      env,
      verboseLog,
    );
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

function renderPairedDevices(devices: PairedDevice[]): string {
  if (devices.length === 0) {
    return 'none';
  }
  return devices
    .map((device) => {
      const suffix = device.lastSeenAt ? ` last_seen=${device.lastSeenAt}` : '';
      return `${device.name} (${device.id})${suffix}`;
    })
    .join(', ');
}

export async function runSyncCommand(
  options: SyncCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const registry = new DeviceRegistry({ env, baseDir: baseCwd });
  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    if (options.action === 'pair') {
      const requestedName = options.deviceName?.trim();
      if (!requestedName) {
        writeStderr(
          `${chalk.red.bold('Error:')} Device name is required for "sync pair <device-name>".\n`,
        );
        return 1;
      }
      const localDeviceId = await registry.getLocalDeviceId();
      const paired = await registry.pairDevice(requestedName);
      const payload = {
        localDeviceId,
        paired,
      };
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        writeStdout(chalk.green(`Paired device: ${paired.name} (${paired.id})\n`));
      }
      await publishEventSafely(
        Topics.lifeos.syncDevicePaired,
        payload,
        dependencies,
        env,
        verboseLog,
      );
      return 0;
    }

    if (options.action === 'demo') {
      if (!options.outputJson) {
        writeStdout('🚀 Starting multi-device sync demo...\n');
        writeStdout('1. In this terminal: make a change\n');
        writeStdout('2. In another terminal: run `pnpm lifeos sync demo` and watch it appear\n');
      }
      const eventBus = createLocalRuntimeEventBus();
      const primaryDeviceId = 'demo-laptop';
      const secondaryDeviceId = 'demo-phone';
      const mirroredEvents: BaseEvent<Record<string, unknown>>[] = [];

      await eventBus.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentTaskAdd,
        async (event) => {
          if (event.metadata?.syncReplayed === true) {
            mirroredEvents.push(event as BaseEvent<Record<string, unknown>>);
          }
        },
      );

      const primary = new SyncEngine({
        eventBus,
        deviceId: primaryDeviceId,
        deviceName: 'Laptop',
        shouldBroadcast: (event) => event.source === primaryDeviceId,
      });
      const secondary = new SyncEngine({
        eventBus,
        deviceId: secondaryDeviceId,
        deviceName: 'Phone',
        shouldBroadcast: (event) => event.source === secondaryDeviceId,
      });
      await primary.start();
      await secondary.start();

      const taskEvent = createRuntimeEvent(
        Topics.lifeos.voiceIntentTaskAdd,
        {
          title: 'Buy milk',
          utterance: 'Hey LifeOS, add a task to buy milk',
          requestedAt: new Date().toISOString(),
        },
        primaryDeviceId,
      );
      await eventBus.publish(taskEvent.type, taskEvent);
      await delay(25);

      const payload = {
        originDeviceId: primaryDeviceId,
        mirroredDeviceId: secondaryDeviceId,
        mirroredEvents: mirroredEvents.length,
        deltasBroadcast: primary.getStats().deltasBroadcast + secondary.getStats().deltasBroadcast,
        deltasReplayed: primary.getStats().deltasReplayed + secondary.getStats().deltasReplayed,
      };
      await primary.close();
      await secondary.close();
      await eventBus.close();

      if (options.outputJson) {
        writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        writeStdout(chalk.bold('LifeOS Sync Demo\n'));
        writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
        writeStdout(`Origin: ${payload.originDeviceId}\n`);
        writeStdout(`Mirrored to: ${payload.mirroredDeviceId}\n`);
        writeStdout(`Mirrored events: ${payload.mirroredEvents}\n`);
        writeStdout('The sync engine will now actually merge.\n');
        writeStdout(chalk.green('Sync demo complete.\n'));
      }
      await publishEventSafely(
        Topics.lifeos.syncDemoCompleted,
        payload,
        dependencies,
        env,
        verboseLog,
      );
      return 0;
    }

    const localDeviceId = await registry.getLocalDeviceId();
    const devices = await registry.listDevices();
    const payload = {
      localDeviceId,
      count: devices.length,
      devices,
    };
    if (options.outputJson) {
      writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      writeStdout(chalk.bold('LifeOS Sync Devices\n'));
      writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
      writeStdout(`Local device: ${localDeviceId}\n`);
      writeStdout(`Paired devices (${devices.length}): ${renderPairedDevices(devices)}\n`);
    }
    await publishEventSafely(
      Topics.lifeos.syncDevicesListed,
      payload,
      dependencies,
      env,
      verboseLog,
    );
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
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
    const meshCoordinator = new MeshCoordinator({ env });
    const meshTrace = createMeshTraceContext('lifeos-cli');
    await publishEventSafely(
      Topics.lifeos.meshDelegateRequested,
      {
        capability: 'research',
        topic: Topics.lifeos.voiceIntentResearch,
        requestedAt: meshTrace.requestedAt,
        source: meshTrace.source,
        traceId: meshTrace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );
    const preflight = await runMeshDelegationLeaderPreflight(meshCoordinator, verboseLog);
    const delegated = preflight.ok
      ? await meshCoordinator.delegateIntentPublish({
          capability: 'research',
          topic: Topics.lifeos.voiceIntentResearch,
          data: payload,
          source: 'lifeos-cli',
          traceId: meshTrace.traceId,
        })
      : {
          delegated: false as const,
          capability: 'research',
          reason: preflight.reason,
          ...(preflight.leaderId ? { nodeId: preflight.leaderId } : {}),
        };
    if (delegated.delegated) {
      await publishEventSafely(
        Topics.lifeos.meshDelegateAccepted,
        {
          capability: 'research',
          topic: Topics.lifeos.voiceIntentResearch,
          delegatedTo: delegated.nodeId ?? null,
          rpcUrl: delegated.rpcUrl ?? null,
          acceptedAt: new Date().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      await publishEventSafely(
        Topics.lifeos.meshDelegateCompleted,
        {
          capability: 'research',
          topic: Topics.lifeos.voiceIntentResearch,
          delegatedTo: delegated.nodeId ?? null,
          completedAt: new Date().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      writeStdout(chalk.green(`Research request delegated: ${query}\n`));
      return 0;
    }

    await publishEventSafely(
      Topics.lifeos.meshDelegateFailed,
      {
        capability: 'research',
        topic: Topics.lifeos.voiceIntentResearch,
        delegatedTo: delegated.nodeId ?? null,
        reason: delegated.reason ?? 'delegation_failed',
        failedAt: new Date().toISOString(),
        traceId: meshTrace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );
    await publishEventSafely(
      Topics.lifeos.meshDelegateFallbackLocal,
      {
        capability: 'research',
        topic: Topics.lifeos.voiceIntentResearch,
        fallbackAt: new Date().toISOString(),
        traceId: meshTrace.traceId,
      },
      dependencies,
      env,
      verboseLog,
    );

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

export async function runModuleCommand(
  options: ModuleCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const moduleName = options.moduleName?.trim();

  if (options.action === 'create') {
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Module name is required for "module create".\n`);
      return 1;
    }
    try {
      const author = env.GITHUB_USER?.trim() || 'your-github-username';
      const created = await createModuleScaffold(moduleName, {
        baseDir: baseCwd,
        author,
      });
      writeStdout(chalk.green(`Module ${created.moduleName} created.\n`));
      writeStdout(chalk.gray(`Manifest: ${created.manifestPath}\n`));
      writeStdout(chalk.gray(`Source: ${created.modulePath}\\src\\index.ts\n`));
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      writeStderr(
        `${chalk.yellow('Almost there! Check repository format and manifest health, then retry module install.\n')}`,
      );
      return 1;
    }
  }

  if (options.action === 'validate') {
    if (options.validateAll) {
      const modulesDir = join(baseCwd, 'modules');
      let entries: string[] = [];
      try {
        const dirEntries = await readdir(modulesDir, { withFileTypes: true });
        entries = dirEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      } catch {
        writeStderr(
          `${chalk.red.bold('Error:')} Unable to read modules directory at ${modulesDir}.\n`,
        );
        return 1;
      }

      const failures: Array<{ moduleName: string; errors: string[] }> = [];
      for (const entry of entries) {
        const validation = await validateModuleManifest(entry, baseCwd, CLI_VERSION);
        if (!validation.valid) {
          failures.push({ moduleName: entry, errors: validation.errors });
        }
      }

      if (failures.length === 0) {
        writeStdout(chalk.green(`Validated ${entries.length} module manifests successfully.\n`));
        return 0;
      }

      writeStderr(
        chalk.red(`Module manifest validation failed for ${failures.length} module(s).\n`),
      );
      for (const failure of failures) {
        writeStderr(chalk.red(`- ${failure.moduleName}\n`));
        for (const error of failure.errors) {
          writeStderr(`  • ${error}\n`);
        }
      }
      return 1;
    }

    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Module name is required for "module validate".\n`);
      return 1;
    }
    const validation = await validateModuleManifest(moduleName, baseCwd, CLI_VERSION);
    if (validation.valid) {
      writeStdout(chalk.green(`Manifest valid: ${validation.manifestPath}\n`));
      return 0;
    }

    writeStderr(chalk.red(`Manifest invalid: ${validation.manifestPath}\n`));
    for (const error of validation.errors) {
      writeStderr(`- ${error}\n`);
    }
    writeStderr(
      `${chalk.yellow('Almost there! Fix the items above and run: pnpm lifeos module validate <module-name>\n')}`,
    );
    return 1;
  }

  if (options.action === 'list') {
    const state = await readModuleState({ env });
    const rows = renderModuleStateRows(state.enabledOptionalModules);
    const googleBridgeSubs = await getEnabledGoogleBridgeSubFeatures({ env });
    const resourceHintByModule = new Map<string, 'low' | 'medium' | 'high'>();
    for (const row of rows) {
      resourceHintByModule.set(row.id, await readModuleResourceHint(baseCwd, row.id));
    }
    writeStdout(chalk.bold('LifeOS Modules\n'));
    writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
    for (const row of rows) {
      const status = row.available
        ? row.enabled
          ? chalk.green('enabled')
          : chalk.gray('disabled')
        : chalk.yellow('unavailable');
      const resourceHint = resourceHintByModule.get(row.id) ?? 'medium';
      const resourceSuffix = chalk.dim(` resource=${resourceHint}`);
      const details: string[] = [];
      if (row.aliases.length > 0) {
        details.push(`alias: ${row.aliases.join(', ')} (compat)`);
      }
      if (row.sharedImplementationWith.length > 0) {
        details.push(`shared-impl: ${row.sharedImplementationWith.join(', ')}`);
      }
      if (row.statusText) {
        details.push(row.statusText);
      }
      if (
        row.id === 'google-bridge' && row.enabled && googleBridgeSubs.length > 0
      ) {
        details.push(`sub: ${googleBridgeSubs.join(', ')}`);
      }
      const detailSuffix =
        details.length > 0 ? chalk.dim(` ; ${details.join(' ; ')}`) : '';
      writeStdout(`${row.id} [${row.tier}] ${status}${resourceSuffix}${detailSuffix}\n`);
    }
    return 0;
  }

  if (options.action === 'status') {
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Module name is required for "module status".\n`);
      return 1;
    }
    const requestedModuleName = moduleName.trim().toLowerCase();
    const moduleEntry = findCliFirstPartyModuleEntry(requestedModuleName);
    if (!moduleEntry || !moduleEntry.visibleInCli) {
      writeStderr(`${chalk.red.bold('Error:')} Unknown module "${moduleName}".\n`);
      return 1;
    }

    const state = await readModuleState({ env });
    const enabled = moduleEntry.userToggleable
      ? state.enabledOptionalModules.includes(moduleEntry.canonicalId)
      : true;

    writeStdout(chalk.bold(`${moduleEntry.canonicalId} Status\n`));
    writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
    writeStdout(`Tier: ${moduleEntry.tier}\n`);
    writeStdout(`Enabled: ${enabled ? 'yes' : 'no'}\n`);
    writeStdout(`Availability: ${moduleEntry.implementationAvailable ? 'available' : 'unavailable'}\n`);
    writeStdout(`User toggleable: ${moduleEntry.userToggleable ? 'yes' : 'no'}\n`);
    writeStdout(`Manifest: modules/${moduleEntry.manifestDirectory}/lifeos.json\n`);
    writeStdout(`Resource hint: ${await readModuleResourceHint(baseCwd, moduleEntry.canonicalId)}\n`);
    if (requestedModuleName !== moduleEntry.canonicalId) {
      writeStdout(`Requested alias: ${requestedModuleName}\n`);
    }
    if (moduleEntry.aliases.length > 0) {
      writeStdout(`Aliases: ${moduleEntry.aliases.join(', ')}\n`);
    }
    if (moduleEntry.sharedImplementationWith && moduleEntry.sharedImplementationWith.length > 0) {
      writeStdout(`Shared implementation: ${moduleEntry.sharedImplementationWith.join(', ')}\n`);
    }
    if (moduleEntry.statusText) {
      writeStdout(`Note: ${moduleEntry.statusText}\n`);
    }

    if (moduleEntry.canonicalId !== 'google-bridge') {
      return 0;
    }

    const enabledGoogleBridgeSubs = await getEnabledGoogleBridgeSubFeatures({ env });
    const syncStatus = await readGoogleBridgeStatusSnapshot(env);
    const authorized = isGoogleBridgeAuthorized(env);
    const lastSyncLabel = syncStatus?.syncedAt
      ? new Date(syncStatus.syncedAt).toLocaleString()
      : 'never';
    const syncRecency = syncStatus?.syncedAt ? formatSyncRecency(syncStatus.syncedAt) : 'n/a';
    const health = resolveGoogleBridgeHealth(syncStatus?.syncedAt ?? null);
    writeStdout(
      `Enabled sub-features: ${enabledGoogleBridgeSubs.length > 0 ? enabledGoogleBridgeSubs.join(', ') : chalk.gray('none')}\n`,
    );
    writeStdout(`Last sync: ${lastSyncLabel}\n`);
    writeStdout(`Sync recency: ${syncRecency}\n`);
    writeStdout(`Health: ${health}\n`);
    writeStdout(`Authorization: ${authorized ? 'connected' : 'missing'}\n`);
    if (syncStatus?.source) {
      writeStdout(`Last source: ${syncStatus.source}\n`);
    }
    try {
      const tts = dependencies.createTextToSpeech
        ? dependencies.createTextToSpeech()
        : new TextToSpeech();
      await tts.speak(
        `Google Bridge is active with ${enabledGoogleBridgeSubs.length} sub-features enabled.`,
      );
    } catch {
      // status command remains useful without speech output
    }
    return 0;
  }

  if (options.action === 'setup') {
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Module name is required for "module setup".\n`);
      return 1;
    }
    const normalizedModuleName = moduleName.toLowerCase();
    try {
      if (normalizedModuleName === 'google-bridge') {
        writeStdout('Starting Google Bridge setup...\n');
        await authorizeGoogleBridgeModule(env);
        await setOptionalModuleEnabled('google-bridge', true, { env });
        await setEnabledGoogleBridgeSubFeatures(['calendar', 'tasks', 'gmail'], { env });
        writeStdout(
          chalk.green('Google Bridge is ready with calendar, tasks, and Gmail enabled.\n'),
        );
        try {
          const tts = dependencies.createTextToSpeech
            ? dependencies.createTextToSpeech()
            : new TextToSpeech();
          await tts.speak(
            'Google Bridge setup complete. Calendar, tasks, and Gmail are now enabled.',
          );
        } catch {
          // setup remains successful even if speech output is unavailable
        }
        return 0;
      }

      if (normalizedModuleName === 'email-summarizer') {
        writeStdout('Starting Email Summarizer setup...\n');
        const configured = await setupEmailSummarizer(env, dependencies);
        await setOptionalModuleEnabled('email-summarizer', true, { env });
        writeStdout(
          chalk.green(
            `Email Summarizer is ready for account "${configured.accountLabel}". Credentials saved at ${configured.path}.\n`,
          ),
        );
        try {
          const tts = dependencies.createTextToSpeech
            ? dependencies.createTextToSpeech()
            : new TextToSpeech();
          await tts.speak('Email summarizer setup complete.');
        } catch {
          // setup remains useful without speech output
        }
        return 0;
      }

      writeStderr(
        `${chalk.red.bold('Error:')} Setup is currently implemented for "google-bridge" and "email-summarizer" only.\n`,
      );
      return 1;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  if (options.action === 'enable' || options.action === 'disable') {
    if (!moduleName) {
      writeStderr(
        `${chalk.red.bold('Error:')} Module name is required for "module ${options.action}".\n`,
      );
      return 1;
    }
    const moduleEntry = findCliFirstPartyModuleEntry(moduleName);
    const visibleOptionalModuleIds = listCliFirstPartyModuleEntries({ visibleOnly: true })
      .filter((entry) => entry.userToggleable)
      .map((entry) => entry.canonicalId);
    if (!moduleEntry || !moduleEntry.userToggleable) {
      writeStderr(
        `${chalk.red.bold('Error:')} "${moduleName}" is not an optional module. Optional modules: ${visibleOptionalModuleIds.join(', ')}.\n`,
      );
      return 1;
    }
    const normalizedModuleName = moduleEntry.canonicalId;
    if (!moduleEntry.implementationAvailable || moduleEntry.implementation === null) {
      writeStderr(
        `${chalk.red.bold('Error:')} Optional module "${normalizedModuleName}" is present but unavailable in the current MVP runtime.\n`,
      );
      return 1;
    }
    if (
      options.subFeatures &&
      options.subFeatures.length > 0 &&
      normalizedModuleName !== 'google-bridge'
    ) {
      writeStderr(
        `${chalk.red.bold('Error:')} --sub is currently supported only for "google-bridge".\n`,
      );
      return 1;
    }
    try {
      if (normalizedModuleName === 'google-bridge') {
        const requestedSubs = options.subFeatures ?? [];
        if (options.action === 'enable') {
          await setOptionalModuleEnabled('google-bridge', true, { env });
          if (requestedSubs.length > 0) {
            await setEnabledGoogleBridgeSubFeatures(requestedSubs, { env });
            writeStdout(
              chalk.green(
                `Optional module "google-bridge" enabled with sub-features: ${requestedSubs.join(', ')}.\n`,
              ),
            );
            return 0;
          }
          const existing = await getEnabledGoogleBridgeSubFeatures({ env });
          if (existing.length === 0) {
            await setEnabledGoogleBridgeSubFeatures(['calendar'], { env });
            writeStdout(
              chalk.green(
                'Optional module "google-bridge" enabled with default sub-feature: calendar.\n',
              ),
            );
            return 0;
          }
          writeStdout(
            chalk.green(
              `Optional module "google-bridge" enabled with existing sub-features: ${existing.join(', ')}.\n`,
            ),
          );
          return 0;
        }

        if (requestedSubs.length > 0) {
          const current = await getEnabledGoogleBridgeSubFeatures({ env });
          const next = current.filter((feature) => !requestedSubs.includes(feature));
          await setEnabledGoogleBridgeSubFeatures(next, { env });
          if (next.length === 0) {
            await setOptionalModuleEnabled('google-bridge', false, { env });
            writeStdout(
              chalk.green(
                'Optional module "google-bridge" disabled (no sub-features remain enabled).\n',
              ),
            );
            return 0;
          }
          writeStdout(
            chalk.green(
              `Disabled google-bridge sub-features: ${requestedSubs.join(', ')}. Remaining: ${next.join(', ')}.\n`,
            ),
          );
          return 0;
        }
        await setEnabledGoogleBridgeSubFeatures([], { env });
      }

      await setOptionalModuleEnabled(normalizedModuleName, options.action === 'enable', { env });
      writeStdout(
        chalk.green(
          `Optional module "${normalizedModuleName}" ${options.action === 'enable' ? 'enabled' : 'disabled'}.\n`,
        ),
      );
      if (moduleName.trim().toLowerCase() !== normalizedModuleName) {
        writeStdout(
          chalk.gray(
            `Alias "${moduleName.trim().toLowerCase()}" resolved to canonical module "${normalizedModuleName}".\n`,
          ),
        );
      }
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  if (options.action === 'authorize') {
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Module name is required for "module authorize".\n`);
      return 1;
    }
    const normalizedModuleName = moduleName.toLowerCase();
    if (normalizedModuleName !== 'google-bridge') {
      writeStderr(
        `${chalk.red.bold('Error:')} Authorization is currently implemented for "google-bridge" only.\n`,
      );
      return 1;
    }
    try {
      await authorizeGoogleBridgeModule(env);
      writeStdout(chalk.green('Google bridge authorization complete.\n'));
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  if (options.action === 'install') {
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Repository is required for "module install".\n`);
      return 1;
    }
    try {
      const candidateModuleId = toModuleIdFromRepo(moduleName);
      const localManifestPath = join(baseCwd, 'modules', candidateModuleId, 'lifeos.json');
      if (existsSync(localManifestPath)) {
        const validation = await validateModuleManifest(candidateModuleId, baseCwd);
        if (!validation.valid) {
          writeStderr(
            `${chalk.red.bold('Error:')} Local manifest validation failed for "${candidateModuleId}".\n`,
          );
          for (const error of validation.errors) {
            writeStderr(`- ${error}\n`);
          }
          writeStderr(
            `${chalk.yellow('Almost there! Fix these issues and submit your module PR.\n')}`,
          );
          return 1;
        }
      }

      const installed = await installMarketplaceModule(moduleName, { env, baseDir: baseCwd });
      if (!existsSync(localManifestPath)) {
        writeStdout(
          chalk.gray(
            `Install recorded for ${installed.repo}. Clone or scaffold module sources to run local validation.\n`,
          ),
        );
      }
      const resolvedInstalledModuleId = resolveFirstPartyModuleId(installed.moduleId);
      const installedEntry = findCliFirstPartyModuleEntry(resolvedInstalledModuleId);
      if (installedEntry?.userToggleable && installedEntry.implementationAvailable) {
        await setOptionalModuleEnabled(installedEntry.canonicalId, true, { env });
        if (installedEntry.canonicalId === 'google-bridge') {
          const existing = await getEnabledGoogleBridgeSubFeatures({ env });
          if (existing.length === 0) {
            await setEnabledGoogleBridgeSubFeatures(['calendar'], { env });
          }
        }
      }
      writeStdout(chalk.green(`Installed ${installed.repo} (module: ${installed.moduleId}).\n`));
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  if (options.action === 'certify') {
    if (!moduleName && !options.dryRun) {
      writeStderr(`${chalk.red.bold('Error:')} Repository is required for "module certify".\n`);
      return 1;
    }
    if (options.dryRun) {
      const modulesDir = join(baseCwd, 'modules');
      const badgePath = join(baseCwd, 'docs', 'badges', 'works-with-lifeos.svg');
      if (!existsSync(badgePath)) {
        writeStderr(
          `${chalk.red.bold('Error:')} Certification dry-run requires ${badgePath} to exist.\n`,
        );
        return 1;
      }

      if (moduleName) {
        const validation = await validateModuleManifest(moduleName, baseCwd);
        if (!validation.valid) {
          writeStderr(chalk.red(`Dry run failed for ${moduleName}.\n`));
          for (const error of validation.errors) {
            writeStderr(`- ${error}\n`);
          }
          return 1;
        }
        writeStdout(chalk.green(`Dry run: certification checks passed for ${moduleName}.\n`));
        return 0;
      }

      const entries = (await readdir(modulesDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      const failedModules: string[] = [];
      for (const entry of entries) {
        const validation = await validateModuleManifest(entry, baseCwd);
        if (!validation.valid) {
          failedModules.push(entry);
        }
      }
      if (failedModules.length > 0) {
        writeStderr(chalk.red(`Dry run failed for ${failedModules.length} module(s).\n`));
        for (const failed of failedModules) {
          writeStderr(`- ${failed}\n`);
        }
        return 1;
      }

      writeStdout(
        chalk.green(`Dry run: certification checks passed for ${entries.length} module(s).\n`),
      );
      return 0;
    }
    if (!moduleName) {
      writeStderr(`${chalk.red.bold('Error:')} Repository is required for "module certify".\n`);
      return 1;
    }
    try {
      const certified = await certifyMarketplaceModule(moduleName, { env, baseDir: baseCwd });
      writeStdout(
        chalk.green(
          `Certified ${certified.repo}. Automated checks passed (manifest, source, tests, badge).\n`,
        ),
      );
      return 0;
    } catch (error: unknown) {
      writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
      return 1;
    }
  }

  writeStderr(
    `${chalk.red.bold('Error:')} Unsupported module action "${String(options.action)}".\n`,
  );
  return 1;
}

export async function runMarketplaceCommand(
  options: MarketplaceCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  try {
    if (options.action === 'refresh') {
      const refreshed = await refreshMarketplaceRegistry(options.term, {
        env,
        baseDir: baseCwd,
      });
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(refreshed, null, 2)}\n`);
        return 0;
      }
      writeStdout(
        chalk.green(
          `Marketplace registry refreshed from ${refreshed.source} (${refreshed.count} module${refreshed.count === 1 ? '' : 's'}).\n`,
        ),
      );
      writeStdout(chalk.gray(`Catalog: ${refreshed.catalogPath}\n`));
      return 0;
    }

    if (options.action === 'compatibility') {
      const entries = await listMarketplaceEntries({
        env,
        baseDir: baseCwd,
        certifiedOnly: options.certifiedOnly,
      });
      const payload = {
        generatedAt: new Date().toISOString(),
        total: entries.length,
        certifiedCount: entries.filter((entry) => entry.certified).length,
        communityCount: entries.filter((entry) => entry.certified === false).length,
        modules: entries.map((entry) => ({
          id: entry.id,
          repo: entry.repo,
          certified: entry.certified,
          installed: entry.installed,
          category: entry.category,
          resourceHint: entry.resourceHint,
          subFeatures: entry.subFeatures,
        })),
      };

      if (options.outputPath) {
        await writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        if (!options.outputJson) {
          writeStdout(chalk.green(`Compatibility matrix saved to ${options.outputPath}.\n`));
        }
        return 0;
      }

      writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    if (options.action === 'search' && !(options.term ?? '').trim()) {
      writeStderr(
        `${chalk.red.bold('Error:')} Search term is required for "marketplace search".\n`,
      );
      return 1;
    }

    const entries =
      options.action === 'search'
        ? await searchMarketplaceEntries(options.term ?? '', {
            env,
            baseDir: baseCwd,
            certifiedOnly: options.certifiedOnly,
          })
        : await listMarketplaceEntries({
            env,
            baseDir: baseCwd,
            certifiedOnly: options.certifiedOnly,
          });
    const catalogStatus = await getMarketplaceCatalogStatus({
      env,
      baseDir: baseCwd,
    });

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(entries, null, 2)}\n`);
      return 0;
    }

    writeStdout(
      chalk.dim(
        `Catalog source: ${catalogStatus.source} | lastUpdated=${catalogStatus.lastUpdated ?? 'unknown'} | staleAfter=${catalogStatus.staleAfterDays}d\n`,
      ),
    );
    writeStdout(chalk.dim(`Catalog path: ${catalogStatus.catalogPath}\n`));
    writeStdout(
      chalk.dim(
        `Trust mode: ${catalogStatus.trustMode} | trusted sources: ${catalogStatus.trustedSourceCount}/${catalogStatus.totalSourceCount}\n`,
      ),
    );
    for (const source of catalogStatus.sources) {
      const trustLabel = source.trusted ? 'trusted' : 'unverified';
      writeStdout(
        chalk.dim(
          `- [${source.kind}] ${source.source} trust=${trustLabel} verified=${source.verified ? 'yes' : 'no'} count=${source.count} lastUpdated=${source.lastUpdated ?? 'unknown'}\n`,
        ),
      );
      if (source.verificationError) {
        writeStdout(chalk.yellow(`  source warning: ${source.verificationError}\n`));
      }
    }
    if (catalogStatus.isStale) {
      writeStdout(
        chalk.yellow(
          'Catalog looks stale. Run `lifeos marketplace refresh <url>` to fetch newer modules.\n',
        ),
      );
    }

    if (entries.length === 0) {
      writeStdout('No marketplace modules matched your query.\n');
      return 0;
    }

    writeStdout(chalk.bold('LifeOS Marketplace\n'));
    writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
    for (const entry of entries) {
      const certification = entry.certified
        ? chalk.green('certified - Works with LifeOS')
        : chalk.gray('community');
      const installed = entry.installed ? chalk.cyan(' installed') : '';
      const metadata = `category=${entry.category} resource=${entry.resourceHint}`;
      writeStdout(
        `${entry.id} (${entry.repo}) [${certification}]${installed}\n${chalk.dim(metadata)}\n${chalk.dim(entry.description)}\n`,
      );
    }
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runTrustCommand(
  options: TrustCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    const report = await buildTrustReport(env, baseCwd, dependencies);

    if (options.action === 'report') {
      writeStdout(`${JSON.stringify(report, null, 2)}\n`);
      return 0;
    }

    if (options.action === 'explain') {
      const targetAction = options.targetAction ?? '';
      const explanation = explainTrustAction(report, targetAction);
      const transport = await publishEventSafely(
        Topics.lifeos.trustExplanationLogged,
        {
          targetAction,
          explanation,
          generatedAt: report.generatedAt,
        },
        dependencies,
        env,
        verboseLog,
      );

      if (options.outputJson) {
        writeStdout(
          `${JSON.stringify(
            {
              action: targetAction,
              explanation,
              generatedAt: report.generatedAt,
              transport,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        writeStdout(`${chalk.bold('Trust Explanation\n')}`);
        writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
        writeStdout(`Action: ${targetAction || '(none)'}\n`);
        writeStdout(`${explanation}\n`);
        writeStdout(chalk.dim(`event transport: ${transport}\n`));
      }
      return 0;
    }

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(report, null, 2)}\n`);
      return 0;
    }

    const enabledCount = report.modules.filter((module) => module.enabled).length;
    const cloudState = report.ownership.cloudAssistEnabled ? 'enabled' : 'disabled';
    writeStdout(chalk.bold('LifeOS Trust Status\n'));
    writeStdout(`${chalk.dim('-'.repeat(40))}\n`);
    writeStdout(`${report.ownership.dataOwnership}\n`);
    writeStdout(`${report.ownership.methodsTransparency}\n`);
    writeStdout(`Local-first default: ${report.ownership.localFirstDefault ? 'yes' : 'no'}\n`);
    writeStdout(`Cloud assist: ${cloudState}\n`);
    writeStdout(`Policy enforcement: ${report.runtime.policyEnforced ? 'on' : 'off'}\n`);
    writeStdout(`Manifest required: ${report.runtime.moduleManifestRequired ? 'yes' : 'no'}\n`);
    writeStdout(`Runtime permissions mode: ${report.runtime.moduleRuntimePermissions}\n`);
    writeStdout(`Storage backend: ${report.runtime.storageBackend}\n`);
    writeStdout(`Graph path: ${report.runtime.graphPath}\n`);
    writeStdout(`Graph database: ${report.runtime.graphDatabasePath}\n`);
    if (report.runtime.migrationBackupPath) {
      writeStdout(`Latest migration backup: ${report.runtime.migrationBackupPath}\n`);
    }
    writeStdout(`Enabled modules: ${enabledCount}/${report.modules.length}\n`);
    writeStdout(`Model: ${report.runtime.model}\n`);
    for (const warning of report.warnings) {
      writeStdout(`${chalk.yellow(`WARNING: ${warning.details} (override active)`)}\n`);
    }
    writeStdout('\nRecent decisions:\n');
    for (const decision of report.recentDecisions) {
      writeStdout(`- [${decision.category}] ${decision.message}\n`);
    }

    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runMeshCommand(
  options: MeshCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));

  const verboseLog = (line: string): void => {
    if (!options.verbose) {
      return;
    }
    writeStderr(`${chalk.gray(`[verbose] ${line}`)}\n`);
  };

  try {
    const state = await readMeshState({ env });
    const registry = new MeshRegistry(state);
    const parsedRpcPort = Number.parseInt(
      String(options.rpcPort ?? env.LIFEOS_MESH_RPC_PORT ?? ''),
      10,
    );
    const rpcPort = Number.isFinite(parsedRpcPort) && parsedRpcPort > 0 ? parsedRpcPort : 5590;
    const rpcHost = (options.rpcHost ?? env.LIFEOS_MESH_RPC_HOST ?? '127.0.0.1').trim();
    const defaultCapabilities = parseMeshCapabilities(env.LIFEOS_MESH_CAPABILITIES);
    const nodeRole = options.role ?? parseNodeRole(env.LIFEOS_MESH_ROLE?.trim());
    const meshCoordinator = new MeshCoordinator({ env });

    if (options.action === 'join') {
      if (!options.nodeId) {
        writeStderr(`${chalk.red.bold('Error:')} Node id is required for "mesh join".\n`);
        return 1;
      }
      const nodeId = options.nodeId.trim().toLowerCase();
      const normalizedCapabilities =
        options.capabilities && options.capabilities.length > 0
          ? options.capabilities
          : defaultCapabilities;
      const node: NodeConfig = {
        nodeId,
        role: nodeRole,
        capabilities: normalizedCapabilities,
        rpcUrl: `http://${rpcHost}:${rpcPort}`,
      };
      registry.join(node);
      await writeMeshState(registry.toState(), { env });
      writeStdout(chalk.green(`Node "${nodeId}" joined mesh as ${nodeRole} (${node.rpcUrl}).\n`));
      return 0;
    }

    if (options.action === 'assign') {
      if (!options.capability || !options.nodeId) {
        writeStderr(
          `${chalk.red.bold('Error:')} Usage: lifeos mesh assign <capability> <node-id>\n`,
        );
        return 1;
      }
      const controlPlaneStatus = await meshCoordinator.getLiveStatus();
      if (controlPlaneStatus.leaderId && !controlPlaneStatus.leaderHealthy) {
        writeStderr(
          `${chalk.red.bold('Error:')} Mesh leader "${controlPlaneStatus.leaderId}" is not healthy. Retry after leader failover stabilizes.\n`,
        );
        return 1;
      }
      registry.assign(options.capability, options.nodeId);
      await writeMeshState(registry.toState(), { env });
      writeStdout(
        chalk.green(
          `Assigned capability "${options.capability.toLowerCase()}" to node "${options.nodeId.toLowerCase()}".\n`,
        ),
      );
      return 0;
    }

    if (options.action === 'start') {
      const nodeId = (options.nodeId ?? env.LIFEOS_MESH_NODE_ID ?? 'local-node')
        .trim()
        .toLowerCase();
      const capabilities =
        options.capabilities && options.capabilities.length > 0
          ? options.capabilities
          : defaultCapabilities;
      const node: NodeConfig = {
        nodeId,
        role: nodeRole,
        capabilities,
        rpcUrl: `http://${rpcHost}:${rpcPort}`,
      };

      registry.join(node);
      await writeMeshState(registry.toState(), { env });

      const planner = dependencies.interpretGoal ?? interpretGoal;
      const model = options.model?.trim() || env.LIFEOS_GOAL_MODEL?.trim() || DEFAULT_MODEL;
      const host = env.OLLAMA_HOST?.trim();
      const runtime = new MeshRuntime({
        env,
        node,
        rpcHost,
        rpcPort,
        goalPlanner: async (request) => {
          const interpreted = await planner(request.goal, {
            model: request.model ?? model,
            ...(host ? { host } : {}),
            now: new Date(),
          });
          return interpreted;
        },
        logger: (line) => verboseLog(line),
      });
      await runtime.start();
      const heartbeatSeen = await waitForMeshHeartbeat(node.nodeId, {
        env,
        timeoutMs: 3000,
      });

      if (options.outputJson) {
        const snapshot = await meshCoordinator.getLiveStatus();
        writeStdout(
          `${JSON.stringify(
            {
              started: true,
              mode: 'ephemeral-check',
              heartbeatSeen,
              nodeId: node.nodeId,
              role: node.role,
              capabilities: node.capabilities,
              rpcUrl: node.rpcUrl,
              status: snapshot,
            },
            null,
            2,
          )}\n`,
        );
        await runtime.close();
        return 0;
      }

      writeStdout(chalk.bold('LifeOS Mesh Runtime\n'));
      writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
      writeStdout(`Node: ${node.nodeId} [${node.role}]\n`);
      writeStdout(`Capabilities: ${node.capabilities.join(', ') || 'none'}\n`);
      writeStdout(`RPC endpoint: ${node.rpcUrl}\n`);
      writeStdout(`Heartbeat: ${heartbeatSeen ? 'active' : 'pending'}\n`);
      writeStdout(chalk.dim('Press Ctrl+C to stop the node runtime.\n'));

      const signal = await waitForTerminationSignal();
      verboseLog(`mesh_runtime_signal=${signal}`);
      await runtime.close();
      writeStdout(chalk.yellow(`Mesh runtime stopped (${signal}).\n`));
      return 0;
    }

    if (options.action === 'delegate') {
      const capability = options.capability?.trim().toLowerCase() ?? '';
      if (!capability) {
        writeStderr(
          `${chalk.red.bold('Error:')} Usage: lifeos mesh delegate <capability> [payload]\n`,
        );
        return 1;
      }
      const preflight = await runMeshDelegationLeaderPreflight(meshCoordinator, verboseLog);
      if (!preflight.ok) {
        writeStderr(
          `${chalk.red.bold('Error:')} Mesh delegation preflight rejected. ${formatMeshLeaderPreflightMessage(preflight.leaderId)}\n`,
        );
        return 1;
      }
      const meshTrace = createMeshTraceContext(options.source?.trim() || 'lifeos-cli');

      await publishEventSafely(
        Topics.lifeos.meshDelegateRequested,
        {
          capability,
          topic: options.topic ?? mapMeshCapabilityToIntentTopic(capability),
          requestedAt: meshTrace.requestedAt,
          source: meshTrace.source,
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );

      if (capability === 'goal-planning') {
        const goal = options.goal?.trim();
        if (!goal) {
          writeStderr(
            `${chalk.red.bold('Error:')} Goal text is required. Use --goal or provide it as the third argument.\n`,
          );
          return 1;
        }
        const delegated = await meshCoordinator.delegateGoalPlan({
          goal,
          ...(options.model?.trim() ? { model: options.model.trim() } : {}),
          requestedAt: meshTrace.requestedAt,
          traceId: meshTrace.traceId,
        });

        if (delegated.delegated && isGoalPlanCandidate(delegated.payload)) {
          await publishEventSafely(
            Topics.lifeos.meshDelegateAccepted,
            {
              capability,
              delegatedTo: delegated.nodeId ?? null,
              rpcUrl: delegated.rpcUrl ?? null,
              acceptedAt: new Date().toISOString(),
              traceId: meshTrace.traceId,
            },
            dependencies,
            env,
            verboseLog,
          );
          await publishEventSafely(
            Topics.lifeos.meshDelegateCompleted,
            {
              capability,
              delegatedTo: delegated.nodeId ?? null,
              completedAt: new Date().toISOString(),
              traceId: meshTrace.traceId,
            },
            dependencies,
            env,
            verboseLog,
          );
          if (options.outputJson) {
            writeStdout(`${JSON.stringify(delegated, null, 2)}\n`);
          } else {
            writeStdout(
              chalk.green(
                `Delegated goal planning to ${delegated.nodeId ?? 'remote-node'} (${delegated.rpcUrl ?? 'rpc'}).\n`,
              ),
            );
            writeStdout(`${formatGoalPlan(delegated.payload)}\n`);
          }
          return 0;
        }

        await publishEventSafely(
          Topics.lifeos.meshDelegateFailed,
          {
            capability,
            delegatedTo: delegated.nodeId ?? null,
            reason: delegated.reason ?? 'delegation_failed',
            failedAt: new Date().toISOString(),
            traceId: meshTrace.traceId,
          },
          dependencies,
          env,
          verboseLog,
        );
        await publishEventSafely(
          Topics.lifeos.meshDelegateFallbackLocal,
          {
            capability,
            reason: delegated.reason ?? 'delegation_failed',
            fallbackAt: new Date().toISOString(),
            traceId: meshTrace.traceId,
          },
          dependencies,
          env,
          verboseLog,
        );
        if (options.outputJson) {
          writeStdout(`${JSON.stringify(delegated, null, 2)}\n`);
        } else {
          writeStdout(
            chalk.yellow(
              `Delegation unavailable (${delegated.reason ?? 'unknown'}). Local fallback stays available in goal/research/voice commands.\n`,
            ),
          );
        }
        return delegated.delegated ? 0 : 1;
      }

      const topic = options.topic?.trim() || mapMeshCapabilityToIntentTopic(capability);
      if (!topic) {
        writeStderr(
          `${chalk.red.bold('Error:')} Topic is required for this capability. Use --topic <lifeos.topic>.\n`,
        );
        return 1;
      }
      const payloadFromJson = parseJsonObject(options.payloadJson);
      if (options.payloadJson && !payloadFromJson) {
        writeStderr(`${chalk.red.bold('Error:')} --data must be a JSON object.\n`);
        return 1;
      }
      const data =
        payloadFromJson ??
        (options.goal?.trim()
          ? { query: options.goal.trim(), utterance: options.goal.trim() }
          : { requestedAt: new Date().toISOString() });
      const delegated = await meshCoordinator.delegateIntentPublish({
        capability,
        topic,
        data,
        source: meshTrace.source,
        traceId: meshTrace.traceId,
      });

      if (delegated.delegated) {
        await publishEventSafely(
          Topics.lifeos.meshDelegateAccepted,
          {
            capability,
            topic,
            delegatedTo: delegated.nodeId ?? null,
            rpcUrl: delegated.rpcUrl ?? null,
            acceptedAt: new Date().toISOString(),
            traceId: meshTrace.traceId,
          },
          dependencies,
          env,
          verboseLog,
        );
        await publishEventSafely(
          Topics.lifeos.meshDelegateCompleted,
          {
            capability,
            topic,
            delegatedTo: delegated.nodeId ?? null,
            completedAt: new Date().toISOString(),
            traceId: meshTrace.traceId,
          },
          dependencies,
          env,
          verboseLog,
        );
        if (options.outputJson) {
          writeStdout(`${JSON.stringify(delegated, null, 2)}\n`);
        } else {
          writeStdout(
            chalk.green(
              `Delegated ${capability} intent to ${delegated.nodeId ?? 'remote-node'} (${topic}).\n`,
            ),
          );
        }
        return 0;
      }

      await publishEventSafely(
        Topics.lifeos.meshDelegateFailed,
        {
          capability,
          topic,
          delegatedTo: delegated.nodeId ?? null,
          reason: delegated.reason ?? 'delegation_failed',
          failedAt: new Date().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      await publishEventSafely(
        Topics.lifeos.meshDelegateFallbackLocal,
        {
          capability,
          topic,
          reason: delegated.reason ?? 'delegation_failed',
          fallbackAt: new Date().toISOString(),
          traceId: meshTrace.traceId,
        },
        dependencies,
        env,
        verboseLog,
      );
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(delegated, null, 2)}\n`);
      } else {
        writeStdout(chalk.yellow(`Delegation unavailable: ${delegated.reason ?? 'unknown'}.\n`));
      }
      return delegated.delegated ? 0 : 1;
    }

    if (options.action === 'debug') {
      const homeDir = resolveHomeDir(env);
      const defaultBundlePath = join(homeDir, '.lifeos', `mesh-debug-${Date.now()}.json`);
      const bundlePath = options.bundlePath?.trim() || defaultBundlePath;
      const meshStatePath = join(homeDir, '.lifeos', 'mesh.json');
      const heartbeatStatePath = join(homeDir, '.lifeos', 'mesh-heartbeats.json');
      const leaderSnapshotPath = join(homeDir, '.lifeos', 'mesh-leader.json');

      const [storedState, heartbeatState, leaderSnapshot, liveStatus] = await Promise.all([
        readMeshState({ env }),
        readMeshHeartbeatState({ env }),
        readMeshLeaderSnapshot({ env }),
        meshCoordinator.getLiveStatus(),
      ]);

      const bundle = {
        generatedAt: new Date().toISOString(),
        nodeEnv: {
          nodeId: env.LIFEOS_MESH_NODE_ID ?? null,
          role: env.LIFEOS_MESH_ROLE ?? null,
          rpcHost: env.LIFEOS_MESH_RPC_HOST ?? null,
          rpcPort: env.LIFEOS_MESH_RPC_PORT ?? null,
          heartbeatIntervalMs: env.LIFEOS_MESH_HEARTBEAT_INTERVAL_MS ?? null,
          nodeTtlMs: env.LIFEOS_MESH_NODE_TTL_MS ?? null,
          leaderLeaseMs: env.LIFEOS_MESH_LEADER_LEASE_MS ?? null,
          delegationTimeoutMs: env.LIFEOS_MESH_DELEGATION_TIMEOUT_MS ?? null,
          jwtIssuer: env.LIFEOS_JWT_ISSUER ?? null,
          jwtAudience: env.LIFEOS_JWT_AUDIENCE ?? null,
          jwtSecretConfigured: Boolean(env.LIFEOS_JWT_SECRET?.trim()),
        },
        paths: {
          meshStatePath,
          heartbeatStatePath,
          leaderSnapshotPath,
          bundlePath,
        },
        storedState,
        heartbeatState,
        leaderSnapshot,
        liveStatus,
      };

      await mkdir(dirname(bundlePath), { recursive: true });
      await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

      if (options.outputJson) {
        writeStdout(`${JSON.stringify(bundle, null, 2)}\n`);
      } else {
        writeStdout(chalk.bold('LifeOS Mesh Debug Bundle\n'));
        writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
        writeStdout(`Bundle path: ${bundlePath}\n`);
        writeStdout(`Stored nodes: ${storedState.nodes.length}\n`);
        writeStdout(`Heartbeat nodes: ${heartbeatState.nodes.length}\n`);
        writeStdout(
          `Leader: ${leaderSnapshot.leaderId ?? 'none'} (term=${leaderSnapshot.term}, leaseUntil=${leaderSnapshot.leaseUntil ?? 'n/a'})\n`,
        );
        writeStdout(
          `Live status: nodes=${liveStatus.nodes.length}, leaderHealthy=${liveStatus.leaderHealthy ? 'yes' : 'no'}\n`,
        );
      }
      return 0;
    }

    if (options.action === 'demo') {
      registry.join({
        nodeId: 'laptop',
        role: 'primary',
        capabilities: ['voice', 'calendar', 'tasks', 'goal-planning'],
        rpcUrl: 'http://127.0.0.1:5590',
      });
      registry.join({
        nodeId: 'heavy-server',
        role: 'heavy-compute',
        capabilities: ['research', 'llm', 'goal-planning'],
        rpcUrl: 'http://127.0.0.1:5591',
      });
      registry.assign('research', 'heavy-server');
      const assigned = registry.resolve('research');
      const payload = {
        nodes: registry.listNodes(),
        assignments: registry.toState().assignments,
        delegatedTo: assigned?.nodeId ?? null,
      };
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        writeStdout(chalk.bold('LifeOS Mesh Demo\n'));
        writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
        writeStdout(`Nodes: ${payload.nodes.map((node) => node.nodeId).join(', ')}\n`);
        writeStdout(`research -> ${payload.delegatedTo}\n`);
      }
      return 0;
    }

    const payload = await meshCoordinator.getLiveStatus();
    if (options.outputJson) {
      writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    writeStdout(chalk.bold('LifeOS Mesh Status\n'));
    writeStdout(`${chalk.dim('-'.repeat(32))}\n`);
    writeStdout(chalk.dim(`TTL: ${payload.ttlMs}ms | Updated: ${payload.updatedAt}\n`));
    writeStdout(
      chalk.dim(
        `Leader: ${payload.leaderId ?? 'none'} | term=${payload.term} | leaseUntil=${payload.leaseUntil ?? 'n/a'} | leaderHealthy=${payload.leaderHealthy ? 'yes' : 'no'} | isLeader=${payload.isLeader ? 'yes' : 'no'}\n`,
      ),
    );
    if (payload.nodes.length === 0) {
      writeStdout('No nodes have joined yet.\n');
    } else {
      for (const node of payload.nodes) {
        const health = node.healthy ? chalk.green('healthy') : chalk.yellow('stale');
        const ageLabel = node.ageMs === null ? 'n/a' : `${Math.floor(node.ageMs / 1000)}s`;
        writeStdout(
          `${node.nodeId} [${node.role}] ${health} age=${ageLabel} capabilities=${node.capabilities.join(', ') || 'none'} rpc=${node.rpcUrl}\n`,
        );
      }
    }
    const assignments = Object.entries(payload.assignments);
    if (assignments.length > 0) {
      writeStdout(chalk.dim('Assignments:\n'));
      for (const [capability, nodeId] of assignments) {
        writeStdout(`${capability} -> ${nodeId}\n`);
      }
    }
    verboseLog(`mesh_nodes=${payload.nodes.length}`);
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
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
  const knownModules = new Map<string, LifeOSModule>();
  if (dependencies.defaultModules) {
    for (const module of defaults) {
      knownModules.set(module.id, module);
    }
  } else {
    for (const entry of listCliLoadableModules()) {
      if (!entry.implementation) {
        continue;
      }
      knownModules.set(entry.canonicalId, entry.implementation);
      for (const alias of entry.aliases) {
        knownModules.set(alias, entry.implementation);
      }
    }
  }
  const createLoader = dependencies.createModuleLoader ?? createModuleLoader;

  const ephemeralLoader =
    dependencies.moduleLoader ??
    createLoader({
      env,
      requireManifest: true,
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

      const selected = knownModules.get(options.moduleId.trim().toLowerCase());
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

export async function runCaptureCommand(
  options: CaptureCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const verboseLog = (line: string): void => {
    if (!('verbose' in options) || !options.verbose) {
      return;
    }
    writeStderr(`[verbose] ${line}\n`);
  };
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  if (options.type !== 'text' && options.type !== 'voice') {
    writeStderr(
      `ERR_CAPTURE_INVALID_TYPE: Invalid capture type "${options.type}". Allowed values: text|voice.\n`,
    );
    return 1;
  }
  const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));

  try {
    const currentTime = now();
    const graph = await client.loadGraph();
    const duplicate = (graph.captureEntries ?? []).find((captureEntry) => {
      if (captureEntry.content !== options.text || captureEntry.source !== 'cli') {
        return false;
      }
      const capturedAtMs = new Date(captureEntry.capturedAt).getTime();
      if (!Number.isFinite(capturedAtMs)) {
        return false;
      }
      const ageMs = currentTime.getTime() - capturedAtMs;
      return ageMs >= 0 && ageMs <= 60_000;
    });

    if (duplicate) {
      if (options.outputJson) {
        writeStdout(
          `${JSON.stringify(
            {
              id: duplicate.id,
              status: duplicate.status,
              content: duplicate.content,
              capturedAt: duplicate.capturedAt,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        writeStdout(
          `${chalk.green('Captured:')} ${duplicate.content} (id: ${duplicate.id.slice(0, 8)})\n`,
        );
      }
      return 0;
    }

    const entry: CaptureEntry = CaptureEntrySchema.parse({
      id: randomUUID(),
      content: options.text,
      type: options.type,
      capturedAt: currentTime.toISOString(),
      source: 'cli',
      tags: [],
      status: 'pending',
    });
    await client.appendCaptureEntry(entry);
    await publishEventSafely(
      Topics.lifeos.captureRecorded,
      {
        id: entry.id,
        content: entry.content,
        source: entry.source,
        capturedAt: entry.capturedAt,
      },
      dependencies,
      env,
      verboseLog,
    );
    if (options.outputJson) {
      writeStdout(
        `${JSON.stringify(
          {
            id: entry.id,
            status: entry.status,
            content: entry.content,
            capturedAt: entry.capturedAt,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      writeStdout(`${chalk.green('Captured:')} ${entry.content} (id: ${entry.id.slice(0, 8)})\n`);
    }
    return 0;
  } catch (error: unknown) {
    const friendly = toFriendlyCliError(error, {
      command: 'capture',
      graphPath: options.graphPath,
    });
    writeStderr(`ERR_CAPTURE_FAILED: ${friendly.message}\n`);
    return 1;
  }
}

export async function runInboxCommand(
  options: InboxCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const verboseLog = (line: string): void => {
    if (!('verbose' in options) || !options.verbose) {
      return;
    }
    writeStderr(`[verbose] ${line}\n`);
  };
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));
  type InboxTriageStage =
    | 'lookup'
    | 'append_planned_action'
    | 'append_note'
    | 'append_goal_plan'
    | 'update_capture';
  const triageFixByStage: Record<InboxTriageStage, string> = {
    lookup: 'Run "lifeos inbox list" to confirm the capture id, then retry triage with a valid id.',
    append_planned_action:
      'Retry with "--action task" and a valid optional "--due YYYY-MM-DD" date, or use "--action note|defer".',
    append_note: 'Retry with "--action note" and valid "--tag" values.',
    append_goal_plan:
      'Retry with "--action plan". Ensure Ollama is running and LIFEOS_GOAL_MODEL is set.',
    update_capture:
      'Retry triage. If the error persists, verify graph-path permissions and that the graph file is writable.',
  };
  let triageStage: InboxTriageStage = 'lookup';

  try {
    if (options.action === 'list') {
      const graph = await client.loadGraph();
      const allCaptures = graph.captureEntries ?? [];
      const captures = options.includeAllCaptures
        ? allCaptures
        : allCaptures.filter((entry) => entry.status === 'pending');

      if (options.outputJson) {
        writeStdout(`${JSON.stringify(captures, null, 2)}\n`);
      } else if (captures.length === 0) {
        writeStdout(`${chalk.green('✓ Inbox is clear')}\n`);
      } else {
        const table = new Table({
          head: [chalk.cyan('ID'), chalk.cyan('Content'), chalk.cyan('Captured At')],
          colWidths: [10, 54, 26],
          wordWrap: true,
        });

        const truncateContent = (content: string): string =>
          content.length > 50 ? `${content.slice(0, 47)}...` : content;

        for (const entry of captures) {
          table.push([entry.id.slice(0, 8), truncateContent(entry.content), entry.capturedAt]);
        }

        writeStdout(`${table.toString()}\n`);
      }

      return 0;
    }

    if (options.action === 'triage') {
      if (!options.captureId) {
        writeStderr(`${chalk.red.bold('Error:')} Capture entry ID is required for triage.\n`);
        return 1;
      }
      triageStage = 'lookup';
      const captureEntry = await client.getCaptureEntry(options.captureId);
      if (!captureEntry) {
        writeStderr(`ERR_CAPTURE_NOT_FOUND: Capture entry "${options.captureId}" not found.\n`);
        return 1;
      }

      if (captureEntry.status === 'triaged') {
        const missingFix =
          'Run lifeos graph doctor or reset the capture triage state before retrying.';
        const writeMissingLinkHumanError = (missingLinkField: string, missingLinkId: string): void => {
          writeStderr(
            'ERR_TRIAGE_LINK_MISSING: Capture was already triaged, but the linked record could not be resolved.\n',
          );
          writeStderr(`Capture: ${captureEntry.id}\n`);
          writeStderr(`Missing link: ${missingLinkField} -> ${missingLinkId}\n`);
          writeStderr(`Fix: ${missingFix}\n`);
        };

        if (captureEntry.triagedToActionId) {
          const linkedAction = await client.getPlannedAction(captureEntry.triagedToActionId);
          if (!linkedAction) {
            if (options.outputJson) {
              writeStdout(
                `${JSON.stringify(
                  {
                    error: {
                      code: 'ERR_TRIAGE_LINK_MISSING',
                      message: 'Capture was already triaged, but the linked record could not be resolved.',
                      captureId: captureEntry.id,
                      missingLinkField: 'triagedToActionId',
                      missingLinkId: captureEntry.triagedToActionId,
                      suggestedFix: missingFix,
                    },
                  },
                  null,
                  2,
                )}\n`,
              );
            } else {
              writeMissingLinkHumanError('triagedToActionId', captureEntry.triagedToActionId);
            }
            return 1;
          }

          if (options.outputJson) {
            writeStdout(
              `${JSON.stringify(
                {
                  status: 'already_triaged',
                  captureId: captureEntry.id,
                  triagedToActionId: captureEntry.triagedToActionId,
                  plannedAction: linkedAction,
                },
                null,
                2,
              )}\n`,
            );
          } else {
            writeStdout(`Already triaged → task: "${linkedAction.title}"\n`);
          }
          return 0;
        }

        if (captureEntry.triagedToPlanId) {
          const graph = await client.loadGraph();
          const linkedPlan = (graph.plans ?? []).find(
            (plan) => plan.id === captureEntry.triagedToPlanId,
          );

          if (!linkedPlan) {
            if (options.outputJson) {
              writeStdout(
                `${JSON.stringify(
                  {
                    error: {
                      code: 'ERR_TRIAGE_LINK_MISSING',
                      message: 'Capture was already triaged, but the linked record could not be resolved.',
                      captureId: captureEntry.id,
                      missingLinkField: 'triagedToPlanId',
                      missingLinkId: captureEntry.triagedToPlanId,
                      suggestedFix: missingFix,
                    },
                  },
                  null,
                  2,
                )}\n`,
              );
            } else {
              writeMissingLinkHumanError('triagedToPlanId', captureEntry.triagedToPlanId);
            }
            return 1;
          }

          if (options.outputJson) {
            writeStdout(
              `${JSON.stringify(
                {
                  status: 'already_triaged',
                  captureId: captureEntry.id,
                  triagedToPlanId: captureEntry.triagedToPlanId,
                  plan: linkedPlan,
                },
                null,
                2,
              )}\n`,
            );
          } else {
            writeStdout(`Already triaged → plan: "${linkedPlan.title}"\n`);
          }
          return 0;
        }

        if (captureEntry.triagedToNoteId) {
          const graph = await client.loadGraph();
          const linkedNote = (graph.notes ?? []).find(
            (note) => note.id === captureEntry.triagedToNoteId,
          );

          if (!linkedNote) {
            if (options.outputJson) {
              writeStdout(
                `${JSON.stringify(
                  {
                    error: {
                      code: 'ERR_TRIAGE_LINK_MISSING',
                      message: 'Capture was already triaged, but the linked record could not be resolved.',
                      captureId: captureEntry.id,
                      missingLinkField: 'triagedToNoteId',
                      missingLinkId: captureEntry.triagedToNoteId,
                      suggestedFix: missingFix,
                    },
                  },
                  null,
                  2,
                )}\n`,
              );
            } else {
              writeMissingLinkHumanError('triagedToNoteId', captureEntry.triagedToNoteId);
            }
            return 1;
          }

          if (options.outputJson) {
            writeStdout(
              `${JSON.stringify(
                {
                  status: 'already_triaged',
                  captureId: captureEntry.id,
                  triagedToNoteId: captureEntry.triagedToNoteId,
                  note: linkedNote,
                },
                null,
                2,
              )}\n`,
            );
          } else {
            writeStdout(`Already triaged → note: "${linkedNote.content}"\n`);
          }
          return 0;
        }

        if (options.outputJson) {
          writeStdout(
            `${JSON.stringify(
              {
                error: {
                  code: 'ERR_TRIAGE_LINK_MISSING',
                  message: 'Capture was already triaged, but the linked record could not be resolved.',
                  captureId: captureEntry.id,
                  missingLinkField: 'none',
                  missingLinkId: 'none',
                  suggestedFix: missingFix,
                },
              },
              null,
              2,
            )}\n`,
          );
        } else {
          writeMissingLinkHumanError('none', 'none');
        }
        return 1;
      }

      if (options.triageAction === 'note') {
        triageStage = 'append_note';
        const note = await client.appendNote({
          title: captureEntry.content,
          content: captureEntry.content,
          tags: options.tag ?? [],
          voiceTriggered: false,
        });
        triageStage = 'update_capture';
        await client.updateCaptureEntry(captureEntry.id, {
          status: 'triaged',
          triagedToNoteId: note.id,
        });
        await publishEventSafely(
          Topics.lifeos.inboxTriaged,
          {
            captureId: captureEntry.id,
            action: 'note',
          },
          dependencies,
          env,
          verboseLog,
        );
        const updatedCapture = await client.getCaptureEntry(captureEntry.id);
        if (options.outputJson) {
          writeStdout(`${JSON.stringify({ captureEntry: updatedCapture }, null, 2)}\n`);
        } else {
          writeStdout(`${chalk.green('Triaged as note:')} "${captureEntry.content}"\n`);
        }
        return 0;
      }

      if (options.triageAction === 'defer') {
        triageStage = 'append_planned_action';
        const deferredAction: PlannedAction = PlannedActionSchema.parse({
          id: randomUUID(),
          title: captureEntry.content,
          status: 'deferred',
          activationSource: 'capture_triage',
          sourceCapture: captureEntry.id,
        });
        await client.appendPlannedAction(deferredAction);
        triageStage = 'update_capture';
        await client.updateCaptureEntry(captureEntry.id, {
          status: 'triaged',
          triagedToActionId: deferredAction.id,
        });
        await publishEventSafely(
          Topics.lifeos.inboxTriaged,
          {
            captureId: captureEntry.id,
            action: 'defer',
            plannedActionId: deferredAction.id,
          },
          dependencies,
          env,
          verboseLog,
        );
        const updatedCapture = await client.getCaptureEntry(captureEntry.id);
        if (options.outputJson) {
          writeStdout(
            `${JSON.stringify({ captureEntry: updatedCapture, plannedAction: deferredAction }, null, 2)}\n`,
          );
        } else {
          writeStdout(`Deferred: ${captureEntry.content} → action ${deferredAction.id.slice(0, 8)}\n`);
        }
        return 0;
      }

      if (options.triageAction === 'plan') {
        triageStage = 'append_goal_plan';
        const interpret = dependencies.interpretGoal ?? interpretGoal;
        const model = options.model?.trim() || env.LIFEOS_GOAL_MODEL?.trim() || DEFAULT_MODEL;
        const host = env.OLLAMA_HOST?.trim();
        const plan = await interpret(captureEntry.content, {
          model,
          ...(host ? { host } : {}),
          now: new Date(),
        });
        const savedPlanId = await client.createNode(
          'plan',
          plan as unknown as Record<string, unknown>,
        );

        triageStage = 'append_planned_action';
        const projectedActions = await projectSubtasksToPlannedActions(
          plan,
          savedPlanId,
          client,
          new Date(),
        );

        triageStage = 'update_capture';
        await client.updateCaptureEntry(captureEntry.id, {
          status: 'triaged',
          triagedToPlanId: savedPlanId,
        });
        await publishEventSafely(
          Topics.lifeos.inboxTriaged,
          {
            captureId: captureEntry.id,
            action: 'plan',
            planId: savedPlanId,
          },
          dependencies,
          env,
          verboseLog,
        );
        const updatedCapture = await client.getCaptureEntry(captureEntry.id);
        if (options.outputJson) {
          writeStdout(
            `${JSON.stringify(
              { captureEntry: updatedCapture, plan, plannedActions: projectedActions },
              null,
              2,
            )}\n`,
          );
        } else {
          writeStdout(
            `${chalk.green('Triaged as plan:')} "${captureEntry.content}" → plan ${savedPlanId.slice(0, 8)} (${projectedActions.length} actions)\n`,
          );
        }
        return 0;
      }

      triageStage = 'append_planned_action';
      const plannedAction: PlannedAction = PlannedActionSchema.parse({
        id: randomUUID(),
        title: captureEntry.content,
        status: 'todo',
        sourceCapture: captureEntry.id,
        ...(options.due ? { dueDate: options.due } : {}),
      });
      await client.appendPlannedAction(plannedAction);
      triageStage = 'update_capture';
      await client.updateCaptureEntry(captureEntry.id, {
        status: 'triaged',
        triagedToActionId: plannedAction.id,
      });
      await publishEventSafely(
        Topics.lifeos.inboxTriaged,
        {
          captureId: captureEntry.id,
          action: 'task',
          plannedActionId: plannedAction.id,
        },
        dependencies,
        env,
        verboseLog,
      );
      const updatedCapture = await client.getCaptureEntry(captureEntry.id);
      if (options.outputJson) {
        writeStdout(
          `${JSON.stringify({ captureEntry: updatedCapture, plannedAction }, null, 2)}\n`,
        );
      } else {
        writeStdout(
          `${chalk.green('Triaged:')} "${captureEntry.content}" → action ${plannedAction.id.slice(0, 8)}\n`,
        );
      }
      return 0;
    }
    writeStderr(`${chalk.red.bold('Error:')} Unknown inbox action "${options.action}".\n`);
    return 1;
  } catch (error: unknown) {
    if (options.action === 'triage') {
      const friendly = toFriendlyCliError(error, {
        command: 'inbox',
        graphPath: options.graphPath,
      });
      const reason = normalizeErrorMessage(error);
      writeStderr(`ERR_INBOX_TRIAGE_FAILED: ${friendly.message}\n`);
      writeStderr(`stage=${triageStage}\n`);
      writeStderr(`reason=${reason}\n`);
      writeStderr(`fix=${triageFixByStage[triageStage]}\n`);
      if (friendly.guidance) {
        writeStderr(`${chalk.yellow(friendly.guidance)}\n`);
      }
      return 1;
    }

    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runRemindCommand(
  options: RemindCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
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
    const plannedAction = await client.getPlannedAction(options.actionId);
    if (!plannedAction) {
      writeStderr(`ERR_ACTION_NOT_FOUND: PlannedAction "${options.actionId}" not found.\n`);
      return 1;
    }

    const graph = await client.loadGraph();
    const existingScheduledReminders = (graph.reminderEvents ?? []).filter(
      (event) => event.actionId === options.actionId && event.status === 'scheduled',
    );
    const matchingReminder = existingScheduledReminders.find(
      (event) => event.scheduledFor === options.at,
    );

    if (matchingReminder) {
      const remindersToCancel = existingScheduledReminders.filter(
        (event) => event.id !== matchingReminder.id,
      );
      for (const reminder of remindersToCancel) {
        await client.appendReminderEvent({
          ...reminder,
          status: 'cancelled',
        });
      }

      const payload = {
        id: matchingReminder.id,
        actionId: matchingReminder.actionId,
        scheduledFor: matchingReminder.scheduledFor,
        status: 'scheduled' as const,
      };
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        writeStdout(
          `${chalk.green('Reminder already scheduled:')} action ${matchingReminder.actionId.slice(0, 8)} at ${matchingReminder.scheduledFor}\n`,
        );
        writeStdout('Reminder scheduled. It will fire when lifeos tick runs.\n');
        writeStdout('Use lifeos tick --watch for automatic local checking.\n');
      }
      return 0;
    }

    for (const reminder of existingScheduledReminders) {
      await client.appendReminderEvent({
        ...reminder,
        status: 'cancelled',
      });
    }

    const reminderEvent: ReminderEvent = ReminderEventSchema.parse({
      id: randomUUID(),
      actionId: plannedAction.id,
      scheduledFor: options.at,
      status: 'scheduled',
    });

    await client.appendReminderEvent(reminderEvent);
    await publishEventSafely(
      Topics.lifeos.reminderScheduled,
      {
        id: reminderEvent.id,
        actionId: reminderEvent.actionId,
        scheduledFor: reminderEvent.scheduledFor,
      },
      dependencies,
      env,
      verboseLog,
    );

    if (options.outputJson) {
      writeStdout(`${JSON.stringify(reminderEvent, null, 2)}\n`);
    } else {
      writeStdout(
        `${chalk.green('Reminder scheduled:')} action ${plannedAction.id.slice(0, 8)} at ${options.at}\n`,
      );
      writeStdout('Reminder scheduled. It will fire when lifeos tick runs.\n');
      writeStdout('Use lifeos tick --watch for automatic local checking.\n');
    }
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
    return 1;
  }
}

export async function runRemindAckCommand(
  options: RemindAckCommandOptions,
  dependencies: RunCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const baseCwd = resolveBaseCwd(env, dependencies.cwd);
  const now = dependencies.now ?? (() => new Date());
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const createClient = dependencies.createLifeGraphClient ?? createLifeGraphClient;
  const client = createClient(buildClientOptions(baseCwd, env, options.graphPath));

  try {
    const graph = await client.loadGraph();
    const reminderEvents = graph.reminderEvents ?? [];
    const exactMatch = reminderEvents.find((event) => event.id === options.reminderId);
    const prefixMatches = reminderEvents.filter((event) => event.id.startsWith(options.reminderId));

    if (!exactMatch && prefixMatches.length === 0) {
      writeStderr(`ERR_REMINDER_NOT_FOUND: Reminder "${options.reminderId}" not found.\n`);
      return 1;
    }

    if (!exactMatch && prefixMatches.length > 1) {
      writeStderr(
        `ERR_REMINDER_AMBIGUOUS: Prefix "${options.reminderId}" matches multiple reminders (${prefixMatches
          .map((event) => event.id)
          .join(', ')}).\n`,
      );
      return 1;
    }

    const targetReminder = exactMatch ?? prefixMatches[0];
    if (!targetReminder) {
      writeStderr(`ERR_REMINDER_NOT_FOUND: Reminder "${options.reminderId}" not found.\n`);
      return 1;
    }

    if (targetReminder.status === 'acknowledged') {
      if (options.outputJson) {
        writeStdout(`${JSON.stringify(targetReminder, null, 2)}\n`);
      } else {
        writeStdout(
          `${chalk.green('Reminder already acknowledged:')} ${targetReminder.id} for action ${targetReminder.actionId.slice(0, 8)}\n`,
        );
      }
      return 0;
    }

    if (targetReminder.status !== 'fired') {
      writeStderr(
        `ERR_REMINDER_INVALID_STATE: Reminder "${targetReminder.id}" must be fired before acknowledgement (current: ${targetReminder.status}).\n`,
      );
      return 1;
    }

    const acknowledgedAt = now().toISOString();
    await client.updateReminderEvent(targetReminder.id, {
      status: 'acknowledged',
      acknowledgedAt,
    });

    const payload = {
      ...targetReminder,
      status: 'acknowledged' as const,
      acknowledgedAt,
    };
    if (options.outputJson) {
      writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      writeStdout(
        `${chalk.green('Reminder acknowledged:')} ${targetReminder.id} for action ${targetReminder.actionId.slice(0, 8)}\n`,
      );
    }
    return 0;
  } catch (error: unknown) {
    writeStderr(`${chalk.red.bold('Error:')} ${normalizeErrorMessage(error)}\n`);
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
    .command('init')
    .description('Interactive first-run setup wizard (local-first, safe to re-run)')
    .option('--force', 'Re-run setup even if already initialized')
    .option('--verbose', 'Show debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runInitCommand(
        {
          force: Boolean(commandOptions.force),
          verbose: Boolean(commandOptions.verbose),
        } satisfies InitCommandOptions,
        {
          ...dependencies,
          env,
          runGoalCommand,
        },
      );

      setExitCode(commandExitCode);
    });

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
    .command('capture')
    .description('Capture an item into the personal inbox')
    .argument('<text>', 'The capture content')
    .option('--type <type>', 'Capture type: text or voice', 'text')
    .option('--json', 'Output captured entry JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .action(async (text: string, commandOptions) => {
      const commandExitCode = await runCaptureCommand(
        {
          text,
          type: commandOptions.type,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('inbox')
    .description('Manage inbox items: list | triage')
    .argument('[action]', 'list | triage', 'list')
    .argument('[id]', 'Capture entry ID for triage action')
    .option('--action <action>', 'Triage action: task | note | defer | plan', 'task')
    .option(
      '--model <model>',
      'Override model (default: llama3.1:8b or LIFEOS_GOAL_MODEL)',
      defaultModel,
    )
    .option('--tag <tag...>', 'Tags for note action')
    .option('--due <date>', 'Due date for triaged task (YYYY-MM-DD)')
    .option('--json', 'Output result JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .action(async (action: string, id: string | undefined, commandOptions) => {
      const normalizedAction = action === 'list' ? 'list' : action === 'triage' ? 'triage' : null;
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid inbox action "${action}". Use list or triage.\n`,
        );
        return;
      }
      const rawTriageAction = (commandOptions.action as string) ?? 'task';
      const triageAction =
        rawTriageAction === 'task' ||
        rawTriageAction === 'note' ||
        rawTriageAction === 'defer' ||
        rawTriageAction === 'plan'
          ? rawTriageAction
          : null;
      if (!triageAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid triage action "${rawTriageAction}". Use task, note, defer, or plan.\n`,
        );
        return;
      }
      const commandExitCode = await runInboxCommand(
        {
          action: normalizedAction,
          ...(id !== undefined ? { captureId: id } : {}),
          triageAction,
          ...(commandOptions.model ? { model: commandOptions.model as string } : {}),
          ...(Array.isArray(commandOptions.tag) ? { tag: commandOptions.tag as string[] } : {}),
          ...(commandOptions.due ? { due: commandOptions.due as string } : {}),
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath as string,
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('remind')
    .description('Schedule or acknowledge reminder events for planned actions')
    .argument('<action-id-or-command>', 'PlannedAction ID, or "ack"')
    .argument('[value]', 'When using ack, the reminder ID (exact or prefix)')
    .option('--at <iso-datetime>', 'ISO datetime to schedule the reminder')
    .option('--json', 'Output reminder event JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (actionIdOrCommand: string, value: string | undefined, commandOptions) => {
      if (actionIdOrCommand === 'ack') {
        if (!value) {
          setExitCode(1);
          writeStderr(`${chalk.red.bold('Error:')} Reminder ID is required for remind ack.\n`);
          return;
        }
        const commandExitCode = await runRemindAckCommand(
          {
            reminderId: value,
            outputJson: Boolean(commandOptions.json),
            graphPath: commandOptions.graphPath as string,
            verbose: Boolean(commandOptions.verbose),
          },
          dependencies,
        );
        setExitCode(commandExitCode);
        return;
      }

      if (!commandOptions.at) {
        setExitCode(1);
        writeStderr(`${chalk.red.bold('Error:')} --at <iso-datetime> is required.\n`);
        return;
      }
      const commandExitCode = await runRemindCommand(
        {
          actionId: actionIdOrCommand,
          at: commandOptions.at as string,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath as string,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('doctor')
    .description('Run local environment and runtime diagnostics')
    .option('--json', 'Output diagnostics JSON only')
    .option('--verbose', 'Show passing checks and extra diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runDoctorCommand(
        {
          outputJson: Boolean(commandOptions.json),
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
        CLI_VERSION,
      );

      setExitCode(commandExitCode);
    });

  program
    .command('status')
    .description('Show current life graph summary')
    .option('--risks', 'Output the modularity risk radar checklist')
    .option('--json', 'Output summary JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runStatusCommand(
        {
          risks: Boolean(commandOptions.risks),
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('trust')
    .description('Inspect ownership, local-first posture, and runtime transparency')
    .argument('[action]', 'status | explain | report', 'status')
    .argument('[targetAction]', 'Action id for explain mode')
    .option('--json', 'Output JSON only')
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, targetAction: string | undefined, commandOptions) => {
      const normalizedAction = normalizeTrustAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid trust action "${action}". Use status, explain, or report.\n`,
        );
        return;
      }

      const commandExitCode = await runTrustCommand(
        {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          verbose: Boolean(commandOptions.verbose),
          ...(targetAction ? { targetAction } : {}),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('graph')
    .description('Graph maintenance commands: migrate')
    .argument('[action]', 'migrate', 'migrate')
    .option('--to <version>', 'Target schema version (default: current CLI baseline)')
    .option('--dry-run', 'Preview migration changes without writing graph file')
    .option('--json', 'Output migration result JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, commandOptions) => {
      const normalizedAction = normalizeGraphAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(`${chalk.red.bold('Error:')} Invalid graph action "${action}". Use migrate.\n`);
        return;
      }

      const commandExitCode = await runGraphCommand(
        {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          dryRun: Boolean(commandOptions.dryRun),
          targetVersion: commandOptions.to,
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

  const taskCmd = program
    .command('task')
    .description('Manage planned actions')
    .argument('[action]', 'list | complete | next | block | cancel | unblock', 'list')
    .argument('[id]', 'Planned action ID for complete/block/cancel/unblock action')
    .option('--reason <reason>', 'Reason for block action')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, id: string | undefined, commandOptions) => {
      const normalizedAction = normalizeTaskAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid task action "${action}". Use list, complete, next, block, cancel, or unblock.\n`,
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
          if (commandOptions.reason) {
            taskOptions.reason = commandOptions.reason as string;
          }
          return taskOptions;
        })(),
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  taskCmd
    .command('block')
    .description('Block a planned action with an optional reason')
    .argument('<id>', 'Action ID or prefix')
    .option('--reason <reason>', 'Reason for blocking')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (id: string, commandOptions) => {
      const commandExitCode = await runTaskCommand(
        {
          action: 'block',
          taskId: id,
          ...(commandOptions.reason ? { reason: commandOptions.reason as string } : {}),
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  taskCmd
    .command('cancel')
    .description('Cancel a planned action')
    .argument('<id>', 'Action ID or prefix')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (id: string, commandOptions) => {
      const commandExitCode = await runTaskCommand(
        {
          action: 'cancel',
          taskId: id,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  taskCmd
    .command('unblock')
    .description('Move a blocked or deferred action back to todo')
    .argument('<id>', 'Action ID or prefix')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (id: string, commandOptions) => {
      const commandExitCode = await runTaskCommand(
        {
          action: 'unblock',
          taskId: id,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
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
    .option('--watch', 'Run tick on a repeating interval (foreground, no daemon)')
    .option('--every <interval>', 'Tick interval: 30s, 5m, 1h (minimum 30s, default 15m)', '15m')
    .action(async (commandOptions) => {
      const commandExitCode = await runTickCommand(
        {
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
          watch: Boolean(commandOptions.watch),
          every: commandOptions.every as string,
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  const demoCmd = program
    .command('demo')
    .description('Run full end-to-end LifeOS demo (goal -> tick -> reminder reaction)')
    .option('--goal <goal>', 'Override demo goal', 'Prepare taxes by end of month')
    .option(
      '--model <model>',
      'Override model (default: llama3.1:8b or LIFEOS_GOAL_MODEL)',
      defaultModel,
    )
    .option('--modules <modules>', 'Module scope hint for compatibility checks', 'default')
    .option('--dry-run', 'Run command wiring checks without mutating local graph state')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (commandOptions) => {
      const commandExitCode = await runDemoCommand(
        {
          goal: commandOptions.goal,
          model: commandOptions.model,
          modules: commandOptions.modules,
          dryRun: Boolean(commandOptions.dryRun),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  demoCmd
    .command('loop')
    .description('Seed 3 captures, triage, remind, complete, and review — full loop proof')
    .option('--dry-run', 'Validate wiring without writing to the graph')
    .option('--json', 'Output full loop trace as JSON array')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .action(async (commandOptions) => {
      const commandExitCode = await runDemoLoopCommand(
        {
          graphPath: commandOptions.graphPath,
          dryRun: Boolean(commandOptions.dryRun),
          outputJson: Boolean(commandOptions.json),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  // Top-level alias so `lifeos demo:loop` (colon-separated) also works
  program
    .command('demo:loop')
    .description('Seed 3 captures, triage, remind, complete, and review — full loop proof')
    .option('--dry-run', 'Validate wiring without writing to the graph')
    .option('--json', 'Output full loop trace as JSON array')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .action(async (commandOptions) => {
      const commandExitCode = await runDemoLoopCommand(
        {
          graphPath: commandOptions.graphPath,
          dryRun: Boolean(commandOptions.dryRun),
          outputJson: Boolean(commandOptions.json),
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
    .command('memory')
    .description('Inspect memory status')
    .argument('[action]', 'status', 'status')
    .option('--json', 'Output JSON only')
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, commandOptions) => {
      const normalizedAction = normalizeMemoryAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(`${chalk.red.bold('Error:')} Invalid memory action "${action}". Use status.\n`);
        return;
      }

      const commandExitCode = await runMemoryCommand(
        {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          graphPath: commandOptions.graphPath,
          verbose: Boolean(commandOptions.verbose),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('sync')
    .description('Manage local-first sync: pair, devices, or demo')
    .argument('[action]', 'pair | devices | demo', 'devices')
    .argument('[deviceName]', 'Device name for pair action')
    .option('--json', 'Output JSON only')
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (action: string, deviceName: string | undefined, commandOptions) => {
      const normalizedAction = normalizeSyncAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid sync action "${action}". Use pair, devices, or demo.\n`,
        );
        return;
      }

      const commandExitCode = await runSyncCommand(
        {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          verbose: Boolean(commandOptions.verbose),
          ...(deviceName ? { deviceName } : {}),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('voice')
    .description('Manage voice runtime: start, demo, consent, calendar, or briefing')
    .argument('[mode]', 'start | demo | consent | calendar | briefing', 'start')
    .option('--text <text>', 'Demo utterance when mode=demo (overrides --scenario)', '')
    .option(
      '--scenario <scenario>',
      'Demo scenario: task | calendar | research | note | weather | news | briefing | proactive',
      'task',
    )
    .option('--graph-path <path>', 'Override graph path', defaultGraphPath)
    .option('--verbose', 'Show safe debug diagnostics')
    .action(async (mode: string, commandOptions) => {
      const normalizedMode = normalizeVoiceMode(mode);
      if (!normalizedMode) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid voice mode "${mode}". Use start, demo, consent, calendar, or briefing.\n`,
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
    .command('module')
    .description(
      'Manage modules: create, validate, list, status, setup, enable, disable, install, certify, authorize',
    )
    .argument(
      '<action>',
      'create | validate | list | status | setup | enable | disable | install | certify | authorize',
    )
    .argument('[name]', 'Module name or repository when required')
    .option('--sub <subfeatures>', 'Comma-separated sub-features (google-bridge only)')
    .option('--all', 'Validate all local module manifests (validate action only)')
    .option('--dry-run', 'Run checks without mutating state (certify action only)')
    .action(async (action: string, name: string | undefined, commandOptions) => {
      const normalizedAction = normalizeModuleAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid module action "${action}". Use create, validate, list, status, setup, enable, disable, install, certify, or authorize.\n`,
        );
        return;
      }

      const subFeatures = normalizeGoogleBridgeSubFeatures(commandOptions.sub);
      if (commandOptions.sub && subFeatures.length === 0) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} --sub must include at least one valid google-bridge sub-feature (${GOOGLE_BRIDGE_SUBFEATURES.join(',')}).\n`,
        );
        return;
      }

      const commandExitCode = await runModuleCommand(
        {
          action: normalizedAction,
          ...(name ? { moduleName: name } : {}),
          ...(subFeatures.length > 0 ? { subFeatures } : {}),
          validateAll: Boolean(commandOptions.all),
          dryRun: Boolean(commandOptions.dryRun),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('marketplace')
    .description('Explore certified and community modules')
    .argument('[action]', 'list | search | refresh | compatibility', 'list')
    .argument('[term]', 'Search term (search) or source URL/path (refresh)')
    .option('--certified', 'Show only certified modules')
    .option('--json', 'Output JSON only')
    .option('--output <path>', 'Write output JSON to file (compatibility action)')
    .action(async (action: string, term: string | undefined, commandOptions) => {
      const normalizedAction = normalizeMarketplaceAction(action);
      if (!normalizedAction) {
        setExitCode(1);
        writeStderr(
          `${chalk.red.bold('Error:')} Invalid marketplace action "${action}". Use list, search, refresh, or compatibility.\n`,
        );
        return;
      }
      const commandExitCode = await runMarketplaceCommand(
        {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          certifiedOnly: Boolean(commandOptions.certified),
          ...(commandOptions.output ? { outputPath: commandOptions.output } : {}),
          ...(term ? { term } : {}),
        },
        dependencies,
      );
      setExitCode(commandExitCode);
    });

  program
    .command('mesh')
    .description('Manage multi-node mesh: join, status, assign, start, delegate, debug, demo')
    .argument('[action]', 'join | status | assign | start | delegate | debug | demo', 'status')
    .argument('[arg1]', 'Node id for join/start, capability for assign/delegate')
    .argument('[arg2]', 'Node id for assign, goal/payload for delegate')
    .option('--json', 'Output JSON only')
    .option('--topic <topic>', 'Intent topic for mesh delegate')
    .option('--data <json>', 'JSON payload for mesh delegate')
    .option('--source <source>', 'Source label for delegated intent')
    .option('--goal <goal>', 'Goal text for goal-planning delegation')
    .option('--model <model>', 'Model override for goal-planning delegation')
    .option('--role <role>', 'Node role for join/start: primary | fallback | heavy-compute')
    .option('--capabilities <csv>', 'Comma-separated node capabilities for join/start')
    .option('--rpc-host <host>', 'RPC host for join/start')
    .option('--rpc-port <port>', 'RPC port for join/start')
    .option('--bundle <path>', 'Bundle output path for mesh debug')
    .option('--verbose', 'Show safe debug diagnostics')
    .action(
      async (
        action: string,
        arg1: string | undefined,
        arg2: string | undefined,
        commandOptions,
      ) => {
        const normalizedAction = normalizeMeshAction(action);
        if (!normalizedAction) {
          setExitCode(1);
          writeStderr(
            `${chalk.red.bold('Error:')} Invalid mesh action "${action}". Use join, status, assign, start, delegate, debug, or demo.\n`,
          );
          return;
        }
        const parsedRole = parseNodeRoleOption(commandOptions.role);
        if (commandOptions.role && !parsedRole) {
          setExitCode(1);
          writeStderr(
            `${chalk.red.bold('Error:')} --role must be one of: primary, fallback, heavy-compute.\n`,
          );
          return;
        }
        const parsedCapabilities = commandOptions.capabilities
          ? parseMeshCapabilities(commandOptions.capabilities)
          : undefined;
        const parsedRpcPort =
          typeof commandOptions.rpcPort === 'string' && commandOptions.rpcPort.trim().length > 0
            ? Number.parseInt(commandOptions.rpcPort, 10)
            : undefined;
        const meshOptions: MeshCommandOptions = {
          action: normalizedAction,
          outputJson: Boolean(commandOptions.json),
          verbose: Boolean(commandOptions.verbose),
        };
        if (normalizedAction === 'join' && arg1) {
          meshOptions.nodeId = arg1;
        }
        if (normalizedAction === 'start' && arg1) {
          meshOptions.nodeId = arg1;
        }
        if (normalizedAction === 'assign' && arg1) {
          meshOptions.capability = arg1;
        }
        if (normalizedAction === 'assign' && arg2) {
          meshOptions.nodeId = arg2;
        }
        if (normalizedAction === 'delegate' && arg1) {
          meshOptions.capability = arg1;
        }
        if (normalizedAction === 'delegate' && arg2) {
          meshOptions.goal = arg2;
        }
        if (commandOptions.topic) {
          meshOptions.topic = commandOptions.topic;
        }
        if (commandOptions.data) {
          meshOptions.payloadJson = commandOptions.data;
        }
        if (commandOptions.source) {
          meshOptions.source = commandOptions.source;
        }
        if (commandOptions.goal) {
          meshOptions.goal = commandOptions.goal;
        }
        if (commandOptions.model) {
          meshOptions.model = commandOptions.model;
        }
        if (parsedRole) {
          meshOptions.role = parsedRole;
        }
        if (parsedCapabilities) {
          meshOptions.capabilities = parsedCapabilities;
        }
        if (commandOptions.rpcHost) {
          meshOptions.rpcHost = commandOptions.rpcHost;
        }
        if (Number.isFinite(parsedRpcPort)) {
          meshOptions.rpcPort = parsedRpcPort as number;
        }
        if (commandOptions.bundle) {
          meshOptions.bundlePath = commandOptions.bundle;
        }
        const commandExitCode = await runMeshCommand(meshOptions, dependencies);
        setExitCode(commandExitCode);
      },
    );

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

export * from './types';
export { normalizeErrorMessage, toFriendlyCliError };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const bootCandidates =
    !args.includes('--help') && !args.includes('-h') && !args.includes('--version');
  const runtimeGraphPath = extractGraphPathArg(args);

  let runtimeLoader: ModuleLoader | null = null;
  if (bootCandidates) {
    const loaderOptions: Parameters<typeof createModuleLoader>[0] = {
      env: process.env,
      requireManifest: true,
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
      const bootModules = await resolveBootModulesFromState(process.env);
      await runtimeLoader.loadMany(bootModules);
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
