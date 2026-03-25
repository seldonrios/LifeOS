import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ImapCredentials } from './events';

const FILE_NAME = 'email-accounts.json';

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) {
    throw new Error('Cannot resolve user home directory for email credentials.');
  }
  return home;
}

function credentialsPath(env: NodeJS.ProcessEnv): string {
  const root = env.LIFEOS_SECRETS_DIR?.trim() || join(resolveHomeDir(env), '.lifeos', 'secrets');
  return join(root, FILE_NAME);
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function toPort(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(65535, Math.trunc(value)));
  }
  return fallback;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOne(entry: unknown): ImapCredentials | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const candidate = entry as Record<string, unknown>;
  const host = getString(candidate.host);
  const user = getString((candidate.auth as Record<string, unknown> | undefined)?.user);
  const pass = getString((candidate.auth as Record<string, unknown> | undefined)?.pass);
  const label = getString(candidate.label);
  if (!host || !user || !pass || !label) {
    return null;
  }
  const secure = toBool(candidate.secure, true);
  const port = toPort(candidate.port, secure ? 993 : 143);
  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    label,
  };
}

export async function readCredentials(env: NodeJS.ProcessEnv): Promise<ImapCredentials[]> {
  const filePath = credentialsPath(env);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeOne(entry))
      .filter((entry): entry is ImapCredentials => entry !== null);
  } catch {
    return [];
  }
}

export async function writeCredentials(
  credentials: ImapCredentials[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const filePath = credentialsPath(env);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
  if (process.platform !== 'win32') {
    await chmod(filePath, 0o600);
  }
}

export function getCredentialsFilePath(env: NodeJS.ProcessEnv): string {
  return credentialsPath(env);
}
