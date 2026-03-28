import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import chalk from 'chalk';

import { baselineModules, getModuleStatePath, readModuleState } from '@lifeos/core';
import { createEventBusClient, type BaseEvent } from '@lifeos/event-bus';
import { getDefaultLifeGraphPath } from '@lifeos/life-graph';

import { normalizeErrorMessage } from '../errors';
import { validateModuleManifest } from './module-create';

export type DoctorCheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  description: string;
  suggestion: string;
  details?: string;
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

function formatCheck(check: DoctorCheck): string {
  const badge =
    check.status === 'PASS'
      ? chalk.green('PASS')
      : check.status === 'WARN'
        ? chalk.yellow('WARN')
        : chalk.red('FAIL');

  const lines = [`[${badge}] ${check.description}`];
  if (check.details) {
    lines.push(`  details: ${check.details}`);
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

  try {
    const host = (env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetchFn(host, { method: 'GET', signal: controller.signal });
      if (!response.ok) {
        checks.push({
          id: 'ollama',
          status: 'WARN',
          description: 'Ollama endpoint is reachable but returned non-OK status',
          details: `${host} -> HTTP ${response.status}`,
          suggestion: 'Confirm Ollama is healthy and model service is ready',
        });
      } else {
        checks.push({
          id: 'ollama',
          status: 'PASS',
          description: 'Ollama endpoint is reachable',
          details: host,
          suggestion: 'No action required',
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: unknown) {
    checks.push({
      id: 'ollama',
      status: 'FAIL',
      description: 'Ollama reachability check failed',
      details: normalizeErrorMessage(error),
      suggestion: 'Run `ollama serve` and verify OLLAMA_HOST',
    });
  }

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
        description: 'NATS unavailable; in-memory fallback active',
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
    const graphRaw = await readFile(graphPath, 'utf8');
    JSON.parse(graphRaw);
    checks.push({
      id: 'life-graph',
      status: 'PASS',
      description: 'Life graph file exists and is parseable',
      details: graphPath,
      suggestion: 'No action required',
    });
  } catch (error: unknown) {
    checks.push({
      id: 'life-graph',
      status: 'FAIL',
      description: 'Life graph file missing or invalid JSON',
      details: `${graphPath}: ${normalizeErrorMessage(error)}`,
      suggestion: 'Run `pnpm lifeos init` or repair the graph file',
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
