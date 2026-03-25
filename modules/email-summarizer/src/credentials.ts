import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ImapCredentials } from './events';

const FILE_NAME = 'email-accounts.json';
const MAX_CREDENTIALS = 25;
const MAX_HOST_CHARS = 255;
const MAX_LABEL_CHARS = 80;
const MAX_USER_CHARS = 254;
const MAX_PASS_CHARS = 2048;

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
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeHost(value: unknown): string | null {
  const host = getString(value);
  if (!host || host.length > MAX_HOST_CHARS || /\s/.test(host)) {
    return null;
  }
  return host;
}

function safeLabel(value: unknown): string | null {
  const label = getString(value);
  if (!label || label.length > MAX_LABEL_CHARS) {
    return null;
  }
  return label;
}

function safeUser(value: unknown): string | null {
  const user = getString(value);
  if (!user || user.length > MAX_USER_CHARS) {
    return null;
  }
  return user;
}

function safePass(value: unknown): string | null {
  const pass = getString(value);
  if (!pass || pass.length > MAX_PASS_CHARS) {
    return null;
  }
  return pass;
}

function normalizeOne(entry: unknown): ImapCredentials | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const candidate = entry as Record<string, unknown>;
  const host = safeHost(candidate.host);
  const user = safeUser((candidate.auth as Record<string, unknown> | undefined)?.user);
  const pass = safePass((candidate.auth as Record<string, unknown> | undefined)?.pass);
  const label = safeLabel(candidate.label);
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
    const normalized = parsed
      .map((entry) => normalizeOne(entry))
      .filter((entry): entry is ImapCredentials => entry !== null);
    const seen = new Set<string>();
    const unique: ImapCredentials[] = [];
    for (const entry of normalized) {
      const key = `${entry.label.toLowerCase()}::${entry.host.toLowerCase()}::${entry.auth.user.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(entry);
      if (unique.length >= MAX_CREDENTIALS) {
        break;
      }
    }
    return unique;
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
