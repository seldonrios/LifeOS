import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import { baselineModules, getModuleStatePath, readModuleState } from '@lifeos/core';
import { createEventBusClient, type BaseEvent } from '@lifeos/event-bus';
import {
  getDefaultLifeGraphPath,
  inspectLifeGraphStorage,
  type LifeGraphStorageInspection,
} from '@lifeos/life-graph';

import { normalizeErrorMessage } from '../errors';
import { validateModuleManifest } from './module-create';

export type DoctorCheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  description: string;
  suggestion: string;
  details?: string | Record<string, unknown>;
}

export interface DoctorCommandOptions {
  outputJson: boolean;
  verbose: boolean;
}

interface DoctorDependencies {
  env?: NodeJS.ProcessEnv;
  cwd?: () => string;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  fetchFn?: typeof fetch;
  inspectLifeGraphStorageFn?: (graphPath?: string) => Promise<LifeGraphStorageInspection>;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
}

const NODE_MIN_VERSION = '20.19.0';

function parseSemver(value: string): ParsedSemver | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function toDbPath(graphPath: string): string {
  if (graphPath.toLowerCase().endsWith('.json')) {
    return `${graphPath.slice(0, -5)}.db`;
  }
  return `${graphPath}.db`;
}

function formatDetailsForText(details: string | Record<string, unknown>): string {
  if (typeof details === 'string') {
    return details;
  }

  const message = typeof details.message === 'string' ? details.message : '';
  const backend = typeof details.backend === 'string' ? details.backend : 'unknown';
  const dbPath = typeof details.dbPath === 'string' ? details.dbPath : 'n/a';
  const sqliteVersionPresent =
    typeof details.sqliteVersionPresent === 'boolean'
      ? String(details.sqliteVersionPresent)
      : 'unknown';
  const jsonFallbackActive =
    typeof details.jsonFallbackActive === 'boolean'
      ? String(details.jsonFallbackActive)
      : 'unknown';

  const parts = [
    message,
    `backend=${backend}`,
    `dbPath=${dbPath}`,
    `sqliteVersionPresent=${sqliteVersionPresent}`,
    `jsonFallbackActive=${jsonFallbackActive}`,
  ].filter((value) => value.length > 0);

  return parts.join('; ');
}

function formatCheck(check: DoctorCheck): string {
  const badge =
    check.status === 'PASS'
      ? chalk.green('PASS')
      : check.status === 'WARN'
        ? chalk.yellow('WARN')
        : chalk.red('FAIL');

  const lines = [`[${badge}] ${check.description}`];
  if (check.details) {
    lines.push(`  details: ${formatDetailsForText(check.details)}`);
  }
  lines.push(`  fix: ${check.suggestion}`);
  return `${lines.join('\n')}\n`;
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
  dependencies: DoctorDependencies = {},
  cliVersion: string,
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const baseCwd = cwd();
  const writeStdout = dependencies.stdout ?? ((message: string) => process.stdout.write(message));
  const writeStderr = dependencies.stderr ?? ((message: string) => process.stderr.write(message));
  const fetchFn = dependencies.fetchFn ?? fetch;
  const inspectLifeGraphStorageFn = dependencies.inspectLifeGraphStorageFn ?? inspectLifeGraphStorage;

  const checks: DoctorCheck[] = [];

  const nodeVersion = parseSemver(process.version);
  const minNodeVersion = parseSemver(NODE_MIN_VERSION);
  if (!nodeVersion || !minNodeVersion || compareSemver(nodeVersion, minNodeVersion) < 0) {
    checks.push({
      id: 'node-version',
      status: 'FAIL',
      description: `Node.js version must be >= ${NODE_MIN_VERSION}`,
      details: `current=${process.version}`,
      suggestion: `Install Node.js ${NODE_MIN_VERSION} or newer`,
    });
  } else {
    checks.push({
      id: 'node-version',
      status: 'PASS',
      description: `Node.js version is compatible (>= ${NODE_MIN_VERSION})`,
      details: `current=${process.version}`,
      suggestion: 'No action required',
    });
  }

  type OllamaResult =
    | { state: 'reachable-ok'; models: string[] }
    | { state: 'reachable-degraded'; status: number }
    | { state: 'unreachable'; message: string };

  const host = (env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').trim();
  let ollamaResult: OllamaResult;
  {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetchFn(host, { method: 'GET', signal: controller.signal });
      if (response.ok) {
        const tagsController = new AbortController();
        const tagsTimeout = setTimeout(() => tagsController.abort(), 2500);
        try {
          const tagsResponse = await fetchFn(`${host}/api/tags`, {
            method: 'GET',
            signal: tagsController.signal,
          });
          if (!tagsResponse.ok) {
            ollamaResult = { state: 'reachable-ok', models: [] };
          } else {
            const payload = (await tagsResponse.json()) as {
              models?: Array<{ name?: string }>;
            };
            const models = (payload.models ?? [])
              .map((model) => model.name?.trim())
              .filter((name): name is string => Boolean(name));
            ollamaResult = { state: 'reachable-ok', models };
          }
        } catch {
          ollamaResult = { state: 'reachable-ok', models: [] };
        } finally {
          clearTimeout(tagsTimeout);
        }
      } else {
        ollamaResult = { state: 'reachable-degraded', status: response.status };
      }
    } catch (error: unknown) {
      ollamaResult = { state: 'unreachable', message: normalizeErrorMessage(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (ollamaResult.state === 'reachable-ok' || ollamaResult.state === 'reachable-degraded') {
    checks.push({
      id: 'ollama-reachability',
      status: 'PASS',
      description: 'Ollama endpoint reachability',
      ...(ollamaResult.state === 'reachable-degraded'
        ? { details: `${host} -> HTTP ${ollamaResult.status}` }
        : {}),
      suggestion: 'No action required',
    });
  } else {
    checks.push({
      id: 'ollama-reachability',
      status: 'WARN',
      description: 'Ollama endpoint reachability',
      details: ollamaResult.message,
      suggestion:
        'Run ollama serve and verify OLLAMA_HOST; some commands work without Ollama',
    });
  }

  const planningCheck: DoctorCheck = {
    id: 'ollama-planning-readiness',
    status: 'FAIL',
    description: 'Ollama planning readiness (required for lifeos goal and lifeos init)',
    suggestion: 'Ollama must be reachable with a loaded model for planning and init to succeed',
  };

  const configuredGoalModel = env.LIFEOS_GOAL_MODEL?.trim();

  if (ollamaResult.state === 'unreachable') {
    planningCheck.details = ollamaResult.message;
  } else if (ollamaResult.state === 'reachable-degraded') {
    planningCheck.details = `${host} -> HTTP ${ollamaResult.status}`;
  } else if (configuredGoalModel) {
    const configuredModelAvailable = ollamaResult.models.includes(configuredGoalModel);
    if (configuredModelAvailable) {
      planningCheck.status = 'PASS';
      planningCheck.details = `Configured goal model '${configuredGoalModel}' is available`;
      planningCheck.suggestion = 'No action required';
    } else {
      planningCheck.details = `Configured goal model '${configuredGoalModel}' is not loaded`;
      planningCheck.suggestion = `Run: ollama pull ${configuredGoalModel} or update LIFEOS_GOAL_MODEL to a loaded model`;
    }
  } else if (ollamaResult.models.length > 0) {
    planningCheck.status = 'PASS';
    planningCheck.details = `${ollamaResult.models.length} model(s) available`;
    planningCheck.suggestion = 'No action required';
  } else {
    planningCheck.details = 'Ollama is reachable but no models are loaded';
    planningCheck.suggestion = 'Run: ollama pull <model-name> (e.g. ollama pull llama3.1:8b)';
  }

  checks.push(planningCheck);

  const bus = createEventBusClient({
    env,
    name: 'lifeos-cli-doctor',
    timeoutMs: 1500,
    maxReconnectAttempts: 0,
  });
  try {
    const probe: BaseEvent<{ probe: true }> = {
      id: 'doctor-probe',
      type: 'lifeos.doctor.probe',
      timestamp: new Date().toISOString(),
      source: 'lifeos-cli-doctor',
      version: '0.1.0',
      data: { probe: true },
    };
    await bus.publish('lifeos.doctor.probe', probe);
    if (bus.getTransport() === 'nats') {
      checks.push({
        id: 'nats',
        status: 'PASS',
        description: 'NATS reachability check passed',
        suggestion: 'No action required',
      });
    } else {
      checks.push({
        id: 'nats',
        status: 'WARN',
          description:
            'NATS unavailable; using non-durable in-memory event fallback. Events will not survive process restart and will not replay. Module reactions still work locally; cross-device sync requires NATS.',
        suggestion: 'Run `docker compose up -d nats` for durable event transport',
      });
    }
  } catch (error: unknown) {
    checks.push({
      id: 'nats',
      status: 'WARN',
      description: 'NATS reachability check degraded',
      details: normalizeErrorMessage(error),
      suggestion: 'Run `docker compose up -d nats`; in-memory fallback may still work',
    });
  } finally {
    await bus.close();
  }

  const graphPath = getDefaultLifeGraphPath({ baseDir: baseCwd, env });
  try {
    const inspection = await inspectLifeGraphStorageFn(graphPath);
    const errorSummary = inspection.errors.join(' | ');
    const warningSummary = inspection.warnings.join(' | ');
    const backendDescription =
      inspection.backendCandidate === 'sqlite'
        ? 'SQLite backend'
        : inspection.backendCandidate === 'json-file'
          ? 'JSON-file fallback backend'
          : inspection.backendCandidate === 'missing'
            ? 'missing backend'
            : 'unknown backend';

    let status: DoctorCheckStatus;
    let description = `Life graph storage inspection (${backendDescription})`;
    let details = `${inspection.dbPath} (backend=${inspection.backendCandidate})`;
    let suggestion = 'No action required';

    if (
      inspection.backendCandidate === 'sqlite' &&
      inspection.sqliteOpenable &&
      inspection.sqliteVersionPresent
    ) {
      status = 'PASS';
      details = `${inspection.dbPath} (sqlite version metadata present)`;
    } else if (
      inspection.backendCandidate === 'sqlite' &&
      inspection.sqliteProbeUnavailable
    ) {
      status = 'WARN';
      suggestion =
        'Install working better-sqlite3 bindings to fully validate SQLite health';
      details = warningSummary || `${inspection.dbPath} (SQLite probe unavailable)`;
    } else if (
      inspection.backendCandidate === 'json-file' &&
      inspection.jsonReadable &&
      inspection.jsonParseable
    ) {
      status = 'WARN';
      suggestion = 'Run `pnpm lifeos init` to migrate to SQLite-backed storage';
      details = `${inspection.graphPath} (JSON fallback active)`;
    } else if (
      inspection.backendCandidate === 'sqlite' &&
      inspection.sqliteExists &&
      !inspection.sqliteOpenable
    ) {
      status = 'FAIL';
      suggestion = 'Repair or replace the SQLite graph database';
      details = errorSummary || `${inspection.dbPath} (SQLite exists but is not openable)`;
    } else if (
      inspection.backendCandidate === 'missing' ||
      inspection.errors.length > 0
    ) {
      status = 'FAIL';
      description = 'Life graph storage missing or invalid';
      suggestion = 'Run `pnpm lifeos init` to initialize graph storage';
      details =
        errorSummary || `${inspection.dbPath} and JSON fallback are unavailable or unreadable`;
    } else {
      status = 'FAIL';
      suggestion = 'Run `pnpm lifeos init` and verify graph storage health';
      details = errorSummary || details;
    }

    checks.push({
      id: 'life-graph',
      status,
      description,
      details: {
        message: details,
        backend: inspection.backendCandidate,
        dbPath: inspection.dbPath,
        sqliteVersionPresent: inspection.sqliteVersionPresent,
        jsonFallbackActive: inspection.backendCandidate === 'json-file',
      },
      suggestion,
    });
  } catch (error: unknown) {
    const dbPath = toDbPath(graphPath);
    checks.push({
      id: 'life-graph',
      status: 'FAIL',
      description: 'Life graph storage inspection failed',
      details: {
        message: `${dbPath}: ${normalizeErrorMessage(error)}`,
        backend: 'unknown',
        dbPath,
        sqliteVersionPresent: false,
        jsonFallbackActive: false,
      },
      suggestion: 'Run `pnpm lifeos init` and re-run doctor',
    });
  }

  const moduleStatePath = getModuleStatePath({ env });
  try {
    const raw = await readFile(moduleStatePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const enabled = Array.isArray(parsed.enabledOptionalModules)
      ? parsed.enabledOptionalModules.filter((value) => typeof value === 'string').length
      : 0;
    checks.push({
      id: 'module-state',
      status: 'PASS',
      description: 'Module state file is valid',
      details: `${moduleStatePath} (enabledOptionalModules=${enabled})`,
      suggestion: 'No action required',
    });
  } catch (error: unknown) {
    checks.push({
      id: 'module-state',
      status: 'WARN',
      description: 'Module state file missing or invalid',
      details: `${moduleStatePath}: ${normalizeErrorMessage(error)}`,
      suggestion: 'Run `pnpm lifeos module list` to regenerate normalized state',
    });
  }

  const moduleState = await readModuleState({ env });
  const enabledModules = [...new Set([...baselineModules, ...moduleState.enabledOptionalModules])];
  const failedManifests: string[] = [];
  for (const moduleId of enabledModules) {
    const result = await validateModuleManifest(moduleId, resolve(baseCwd), cliVersion);
    if (!result.valid) {
      failedManifests.push(`${moduleId}: ${result.errors.join('; ')}`);
    }
  }
  if (failedManifests.length > 0) {
    checks.push({
      id: 'module-manifests',
      status: 'FAIL',
      description: 'One or more enabled module manifests failed validation',
      details: failedManifests.join(' | '),
      suggestion: 'Run `pnpm lifeos module validate <module-id>` and fix lifeos.json errors',
    });
  } else {
    checks.push({
      id: 'module-manifests',
      status: 'PASS',
      description: 'Enabled module manifests passed validation',
      details: `${enabledModules.length} module(s) checked`,
      suggestion: 'No action required',
    });
  }

  const syncAuthOverride = env.LIFEOS_SYNC_REQUIRE_AUTH?.trim();
  if (syncAuthOverride === '0') {
    checks.push({
      id: 'sync-auth',
      status: 'WARN',
      description: 'Sync authentication override active',
      details: 'LIFEOS_SYNC_REQUIRE_AUTH=0 disables Ed25519 delta verification',
      suggestion:
        'Remove LIFEOS_SYNC_REQUIRE_AUTH=0 to restore the secure default; see docs/SETUP.md',
    });
  } else {
    checks.push({
      id: 'sync-auth',
      status: 'PASS',
      description: 'Sync authentication is enabled (Ed25519 + TOFU)',
      suggestion: 'No action required',
    });
  }

  const failCount = checks.filter((check) => check.status === 'FAIL').length;

  if (options.outputJson) {
    writeStdout(`${JSON.stringify({ checks, failCount }, null, 2)}\n`);
  } else {
    writeStdout(chalk.bold('LifeOS Doctor\n'));
    for (const check of checks) {
      if (!options.verbose && check.status === 'PASS') {
        continue;
      }
      const target = check.status === 'FAIL' ? writeStderr : writeStdout;
      target(formatCheck(check));
    }
    writeStdout(`\nSummary: ${checks.length - failCount}/${checks.length} checks without FAIL\n`);
  }

  return failCount === 0 ? 0 : 1;
}
