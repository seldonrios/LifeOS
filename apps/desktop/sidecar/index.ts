import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  runGoalCommand,
  runMarketplaceCommand,
  runModuleCommand,
  runStatusCommand,
  runTaskCommand,
} from '@lifeos/cli';

type RpcCommand =
  | 'graph_summary'
  | 'goal_run'
  | 'task_list'
  | 'task_complete'
  | 'modules_list'
  | 'module_enable'
  | 'module_disable'
  | 'marketplace_list'
  | 'settings_read'
  | 'settings_write'
  | 'settings_models';

interface RpcRequest {
  id?: string;
  command: RpcCommand;
  args?: Record<string, unknown>;
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

interface RunCaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface DesktopSettings {
  model: string;
  ollamaHost: string;
  natsUrl: string;
  voiceEnabled: boolean;
}

const SETTINGS_PATH = join(homedir(), '.lifeos', 'init.json');
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 32_768;
const MAX_ID_LENGTH = 128;
const MAX_GOAL_LENGTH = 4_000;
const MAX_MODULE_ID_LENGTH = 128;
const MAX_MODEL_LENGTH = 256;
const OLLAMA_TAGS_TIMEOUT_MS = 5_000;
const MAX_OLLAMA_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_OLLAMA_MODELS = 100;
const MODEL_IDENTIFIER_PATTERN = /^[a-zA-Z0-9._:/-]+$/;

const VALID_COMMANDS: ReadonlySet<RpcCommand> = new Set([
  'graph_summary',
  'goal_run',
  'task_list',
  'task_complete',
  'modules_list',
  'module_enable',
  'module_disable',
  'marketplace_list',
  'settings_read',
  'settings_write',
  'settings_models',
]);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
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

function normalizeModel(value: unknown): string {
  const model = String(value ?? 'llama3.1:8b').trim();
  if (!isValidModelIdentifier(model)) {
    return 'llama3.1:8b';
  }
  return model;
}

function isValidModelIdentifier(model: string): boolean {
  if (model.length === 0 || model.length > MAX_MODEL_LENGTH || !MODEL_IDENTIFIER_PATTERN.test(model)) {
    return false;
  }

  if (model.startsWith('/') || model.endsWith('/') || model.includes('//')) {
    return false;
  }

  return model.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function normalizeModuleId(value: unknown): string {
  const id = String(value ?? '').trim().toLowerCase();
  if (!id || id.length > MAX_MODULE_ID_LENGTH || /[^a-z0-9-]/.test(id)) {
    throw new Error('Invalid module id.');
  }
  return id;
}

function normalizeGoal(value: unknown): string {
  const goal = String(value ?? '').trim();
  if (!goal) {
    throw new Error('Goal input is required.');
  }
  if (goal.length > MAX_GOAL_LENGTH) {
    throw new Error(`Goal exceeds ${MAX_GOAL_LENGTH} characters.`);
  }
  return goal;
}

function normalizeTaskId(value: unknown): string {
  const taskId = String(value ?? '').trim();
  if (!taskId || taskId.length > MAX_MODULE_ID_LENGTH || /[^a-zA-Z0-9._:-]/.test(taskId)) {
    throw new Error('Invalid task id.');
  }
  return taskId;
}

function normalizeHttpUrl(value: unknown, fallback: string): string {
  const candidate = String(value ?? fallback).trim();
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function normalizeNatsUrl(value: unknown, fallback: string): string {
  const candidate = String(value ?? fallback).trim();
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'nats:' && parsed.protocol !== 'tls:') {
      return fallback;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

async function runCapture(
  execute: (dependencies: {
    stdout: (message: string) => void;
    stderr: (message: string) => void;
  }) => Promise<number>,
): Promise<RunCaptureResult> {
  let stdout = '';
  let stderr = '';

  const exitCode = await withTimeout(
    execute({
      stdout: (message) => {
        stdout += message;
      },
      stderr: (message) => {
        stderr += message;
      },
    }),
    REQUEST_TIMEOUT_MS,
    `Command timed out after ${REQUEST_TIMEOUT_MS}ms`,
  );

  return {
    exitCode,
    stdout,
    stderr,
  };
}

export function parseJsonOutput<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Command did not return JSON output.');
  }

  const firstObject = Math.min(
    ...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0),
  );
  if (!Number.isFinite(firstObject)) {
    throw new Error(`Expected JSON output but received: ${trimmed.slice(0, 140)}`);
  }

  const jsonText = trimmed.slice(firstObject);
  return JSON.parse(jsonText) as T;
}

export function parseModuleList(stdout: string): Array<{
  id: string;
  tier: string;
  enabled: boolean;
  available: boolean;
  subFeatures: string[];
}> {
  const lines = stdout.split(/\r?\n/);
  const rows: Array<{ id: string; tier: string; enabled: boolean; available: boolean; subFeatures: string[] }> = [];

  for (const line of lines) {
    const match = line.match(/^([a-z0-9-]+) \[([a-z]+)] (enabled|disabled)(?: \(not installed\))?(?: \(sub: ([^)]+)\))?/i);
    if (!match) {
      continue;
    }

    const [, id, tier, state, subFeaturesRaw] = match;
    rows.push({
      id,
      tier,
      enabled: state === 'enabled',
      available: !line.includes('(not installed)'),
      subFeatures: subFeaturesRaw ? subFeaturesRaw.split(',').map((item) => item.trim()) : [],
    });
  }

  return rows;
}

async function readSettingsFile(): Promise<DesktopSettings> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
    return {
      model: normalizeModel(parsed.model),
      ollamaHost: normalizeHttpUrl(parsed.ollamaHost, 'http://127.0.0.1:11434'),
      natsUrl: normalizeNatsUrl(parsed.natsUrl, 'nats://127.0.0.1:4222'),
      voiceEnabled: typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : true,
    };
  } catch {
    return {
      model: 'llama3.1:8b',
      ollamaHost: 'http://127.0.0.1:11434',
      natsUrl: 'nats://127.0.0.1:4222',
      voiceEnabled: true,
    };
  }
}

async function writeSettingsFile(update: Partial<DesktopSettings>): Promise<DesktopSettings> {
  const base = await readSettingsFile();
  const merged: DesktopSettings = {
    model: normalizeModel(update.model ?? base.model),
    ollamaHost: normalizeHttpUrl(update.ollamaHost ?? base.ollamaHost, base.ollamaHost),
    natsUrl: normalizeNatsUrl(update.natsUrl ?? base.natsUrl, base.natsUrl),
    voiceEnabled: typeof update.voiceEnabled === 'boolean' ? update.voiceEnabled : base.voiceEnabled,
  };
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

async function readResponseTextWithinLimit(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Response exceeds ${maxBytes} bytes.`);
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error(`Response exceeds ${maxBytes} bytes.`);
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function readOllamaModelNames(ollamaHost: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, OLLAMA_TAGS_TIMEOUT_MS);

  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json') && !contentType.includes('+json')) {
      return [];
    }

    const responseText = await readResponseTextWithinLimit(response, MAX_OLLAMA_RESPONSE_BYTES);
    const payload = JSON.parse(responseText) as {
      models?: Array<{ name?: unknown }>;
    };

    if (!Array.isArray(payload.models)) {
      return [];
    }

    return [
      ...new Set(
        payload.models
          .slice(0, MAX_OLLAMA_MODELS)
          .map((item) => String(item?.name ?? '').trim())
          .filter((name) => isValidModelIdentifier(name)),
      ),
    ];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function executeCommand(request: RpcRequest): Promise<unknown> {
  switch (request.command) {
    case 'graph_summary': {
      const output = await runCapture((dependencies) =>
        runStatusCommand(
          {
            outputJson: true,
            graphPath: '',
            verbose: false,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'graph_summary failed');
      }
      return parseJsonOutput(output.stdout);
    }

    case 'goal_run': {
      const goal = normalizeGoal(request.args?.goal);
      const model = normalizeModel(request.args?.model);
      const output = await runCapture((dependencies) =>
        runGoalCommand(
          goal,
          {
            outputJson: true,
            save: false,
            graphPath: '',
            model,
            verbose: false,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'goal_run failed');
      }
      return parseJsonOutput(output.stdout);
    }

    case 'task_list': {
      const output = await runCapture((dependencies) =>
        runTaskCommand(
          {
            action: 'list',
            graphPath: '',
            outputJson: true,
            verbose: false,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'task_list failed');
      }
      return parseJsonOutput(output.stdout);
    }

    case 'task_complete': {
      const taskId = normalizeTaskId(request.args?.taskId);
      const output = await runCapture((dependencies) =>
        runTaskCommand(
          {
            action: 'complete',
            taskId,
            graphPath: '',
            outputJson: true,
            verbose: false,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'task_complete failed');
      }
      return parseJsonOutput(output.stdout);
    }

    case 'modules_list': {
      const output = await runCapture((dependencies) =>
        runModuleCommand(
          {
            action: 'list',
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'modules_list failed');
      }
      return parseModuleList(output.stdout);
    }

    case 'module_enable': {
      const id = normalizeModuleId(request.args?.id);
      const output = await runCapture((dependencies) =>
        runModuleCommand(
          {
            action: 'enable',
            moduleName: id,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'module_enable failed');
      }
      return { id, enabled: true };
    }

    case 'module_disable': {
      const id = normalizeModuleId(request.args?.id);
      const output = await runCapture((dependencies) =>
        runModuleCommand(
          {
            action: 'disable',
            moduleName: id,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'module_disable failed');
      }
      return { id, enabled: false };
    }

    case 'marketplace_list': {
      const certifiedOnly = Boolean(request.args?.certifiedOnly ?? false);
      const output = await runCapture((dependencies) =>
        runMarketplaceCommand(
          {
            action: 'list',
            certifiedOnly,
            outputJson: true,
          },
          dependencies,
        ),
      );
      if (output.exitCode !== 0) {
        throw new Error(output.stderr || 'marketplace_list failed');
      }
      return parseJsonOutput(output.stdout);
    }

    case 'settings_read': {
      return readSettingsFile();
    }

    case 'settings_write': {
      return writeSettingsFile({
        model: request.args?.model as string | undefined,
        ollamaHost: request.args?.ollamaHost as string | undefined,
        natsUrl: request.args?.natsUrl as string | undefined,
        voiceEnabled: request.args?.voiceEnabled as boolean | undefined,
      });
    }

    case 'settings_models': {
      const settings = await readSettingsFile();
      return {
        models: await readOllamaModelNames(settings.ollamaHost),
      };
    }

    default:
      throw new Error(`Unsupported command: ${String(request.command)}`);
  }
}

export async function processRequest(raw: string): Promise<RpcResponse> {
  if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) {
    return { id: 'unknown', error: 'Request exceeds size limit.' };
  }

  let request: RpcRequest;
  try {
    request = JSON.parse(raw) as RpcRequest;
  } catch {
    return { id: 'unknown', error: 'Invalid JSON request' };
  }

  if (!request || typeof request !== 'object' || !VALID_COMMANDS.has(request.command)) {
    return { id: 'unknown', error: 'Unsupported command' };
  }

  const id =
    typeof request.id === 'string' && request.id.trim().length > 0 && request.id.length <= MAX_ID_LENGTH
      ? request.id
      : randomUUID();

  const response: RpcResponse = { id };
  try {
    response.result = await withTimeout(
      executeCommand(request),
      REQUEST_TIMEOUT_MS,
      `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
    );
  } catch (error: unknown) {
    response.error = error instanceof Error ? error.message : 'Unknown sidecar error';
  }

  return response;
}

async function handleRequest(raw: string): Promise<void> {
  const response = await processRequest(raw);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export function startSidecarServer(): void {
  const lineReader = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  lineReader.on('line', (line) => {
    void handleRequest(line);
  });

  lineReader.on('close', () => {
    process.exit(0);
  });
}

function isExecutedDirectly(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isExecutedDirectly()) {
  startSidecarServer();
}
