import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TIMEOUT_MS = 180_000;
const CLOCK_SKEW_MS = 60_000;

export const GOOGLE_BRIDGE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/keep.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

export interface GoogleBridgeOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

export interface GoogleBridgeOAuthOptions {
  env?: NodeJS.ProcessEnv;
  tokenPath?: string;
}

interface OAuthClientSecrets {
  clientId: string;
  clientSecret: string;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || process.cwd();
}

export function getGoogleBridgeTokenPath(options: GoogleBridgeOAuthOptions = {}): string {
  if (options.tokenPath) {
    return options.tokenPath;
  }
  const env = options.env ?? process.env;
  return join(resolveHomeDir(env), '.lifeos', 'secrets', 'google.json');
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getClientSecrets(env: NodeJS.ProcessEnv): OAuthClientSecrets {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
  }
  return {
    clientId,
    clientSecret,
  };
}

async function readTokens(
  options: GoogleBridgeOAuthOptions = {},
): Promise<GoogleBridgeOAuthTokens | null> {
  const path = getGoogleBridgeTokenPath(options);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as GoogleBridgeOAuthTokens;
  } catch {
    return null;
  }
}

async function writeTokens(
  tokens: GoogleBridgeOAuthTokens,
  options: GoogleBridgeOAuthOptions = {},
): Promise<void> {
  const path = getGoogleBridgeTokenPath(options);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function shouldRefresh(tokens: GoogleBridgeOAuthTokens): boolean {
  if (!tokens.access_token) {
    return true;
  }
  if (!tokens.expiry_date) {
    return false;
  }
  return tokens.expiry_date <= Date.now() + CLOCK_SKEW_MS;
}

function resolveRedirectUri(env: NodeJS.ProcessEnv): { redirectUri: string; port: number } {
  const rawPort = Number.parseInt(env.LIFEOS_GOOGLE_OAUTH_PORT ?? '', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 53682;
  return {
    redirectUri: `http://127.0.0.1:${port}/oauth2callback`,
    port,
  };
}

async function refreshAccessToken(
  tokens: GoogleBridgeOAuthTokens,
  options: GoogleBridgeOAuthOptions = {},
): Promise<GoogleBridgeOAuthTokens> {
  const env = options.env ?? process.env;
  const { clientId, clientSecret } = getClientSecrets(env);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google refresh token missing. Re-authorize with: lifeos module authorize google-bridge',
    );
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  if (!payload.access_token) {
    throw new Error('Google token refresh response missing access_token.');
  }

  const refreshed: GoogleBridgeOAuthTokens = {
    access_token: payload.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    ...((payload.token_type ?? tokens.token_type)
      ? { token_type: payload.token_type ?? tokens.token_type }
      : {}),
    ...((payload.scope ?? tokens.scope) ? { scope: payload.scope ?? tokens.scope } : {}),
    ...(typeof payload.expires_in === 'number'
      ? { expiry_date: Date.now() + payload.expires_in * 1000 }
      : typeof tokens.expiry_date === 'number'
        ? { expiry_date: tokens.expiry_date }
        : {}),
  };
  await writeTokens(refreshed, options);
  return refreshed;
}

function openExternal(url: string): boolean {
  if ((process.env.LIFEOS_NO_BROWSER ?? '').trim() === '1') {
    return false;
  }
  const platform = process.platform;
  try {
    const launch = (command: string, args: string[]): boolean => {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', () => {
        return;
      });
      child.unref();
      return true;
    };

    if (platform === 'win32') {
      const escaped = url.replace(/&/g, '^&');
      return launch('cmd', ['/c', 'start', '""', escaped]);
    }
    if (platform === 'darwin') {
      return launch('open', [url]);
    }
    return launch('xdg-open', [url]);
  } catch {
    return false;
  }
}

function renderOAuthResponse(
  res: ServerResponse<IncomingMessage>,
  ok: boolean,
  message: string,
): void {
  res.statusCode = ok ? 200 : 400;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    `<!doctype html><html><body><h2>${ok ? 'LifeOS authorization complete' : 'LifeOS authorization failed'}</h2><p>${message}</p></body></html>`,
  );
}

async function waitForOAuthCode(port: number, expectedState: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for Google OAuth callback.'));
    }, OAUTH_TIMEOUT_MS);

    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (requestUrl.pathname !== '/oauth2callback') {
        renderOAuthResponse(res, false, 'Invalid callback route.');
        return;
      }

      const state = requestUrl.searchParams.get('state');
      if (state !== expectedState) {
        renderOAuthResponse(res, false, 'OAuth state mismatch.');
        clearTimeout(timer);
        server.close();
        reject(new Error('Google OAuth state mismatch.'));
        return;
      }

      const code = requestUrl.searchParams.get('code');
      const oauthError = requestUrl.searchParams.get('error');
      if (oauthError) {
        renderOAuthResponse(res, false, `Google returned: ${oauthError}`);
        clearTimeout(timer);
        server.close();
        reject(new Error(`Google OAuth denied: ${oauthError}`));
        return;
      }
      if (!code) {
        renderOAuthResponse(res, false, 'Authorization code missing.');
        clearTimeout(timer);
        server.close();
        reject(new Error('Google OAuth callback missing code.'));
        return;
      }

      renderOAuthResponse(res, true, 'You can close this browser tab.');
      clearTimeout(timer);
      server.close();
      resolve(code);
    });

    server.listen(port, '127.0.0.1');
    server.on('error', (error: unknown) => {
      clearTimeout(timer);
      reject(
        new Error(`Unable to start local OAuth callback server: ${normalizeErrorMessage(error)}`),
      );
    });
  });
}

async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  options: GoogleBridgeOAuthOptions = {},
): Promise<GoogleBridgeOAuthTokens> {
  const env = options.env ?? process.env;
  const { clientId, clientSecret } = getClientSecrets(env);
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${body.slice(0, 400)}`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new Error('Google token exchange response missing access_token.');
  }
  return {
    access_token: payload.access_token,
    ...(payload.refresh_token ? { refresh_token: payload.refresh_token } : {}),
    ...(payload.token_type ? { token_type: payload.token_type } : {}),
    ...(payload.scope ? { scope: payload.scope } : {}),
    ...(typeof payload.expires_in === 'number'
      ? { expiry_date: Date.now() + payload.expires_in * 1000 }
      : {}),
  };
}

export async function authorizeGoogleBridge(options: GoogleBridgeOAuthOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const { clientId } = getClientSecrets(env);
  const { redirectUri, port } = resolveRedirectUri(env);
  const state = randomUUID();

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_BRIDGE_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const authUrlText = authUrl.toString();
  const opened = openExternal(authUrlText);
  if (opened) {
    console.log('Opening browser for Google OAuth authorization...');
  } else {
    console.log('Open this URL to authorize Google Bridge:');
    console.log(authUrlText);
  }

  const code = await waitForOAuthCode(port, state);
  const exchanged = await exchangeAuthorizationCode(code, redirectUri, options);
  const existing = await readTokens(options);
  const merged: GoogleBridgeOAuthTokens = {
    ...exchanged,
    ...(exchanged.refresh_token
      ? {}
      : existing?.refresh_token
        ? { refresh_token: existing.refresh_token }
        : {}),
  };
  await writeTokens(merged, options);
}

export async function getGoogleAccessToken(
  options: GoogleBridgeOAuthOptions = {},
): Promise<string> {
  const tokens = await readTokens(options);
  if (!tokens) {
    throw new Error('Google OAuth tokens not found. Run: lifeos module authorize google-bridge');
  }

  if (!shouldRefresh(tokens)) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens, options);
  return refreshed.access_token;
}
