export * from './types';

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { JwtPayload, SecurityClient, ServiceToken } from './types';

const DEFAULT_ISSUER = 'lifeos.local';
const DEFAULT_AUDIENCE = 'lifeos.services';
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 30;
const DEFAULT_SIGNING_SECRET = 'lifeos-dev-secret-change-me';
const DEFAULT_SERVICE_SCOPES = ['service.read', 'policy.check'];

export const SECURITY_DEFAULT_SIGNING_SECRET = DEFAULT_SIGNING_SECRET;
export const SECURITY_TEST_SIGNING_SECRET = 'lifeos-test-secret';

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${'='.repeat(padLength)}`, 'base64');
}

function toJsonRecord(value: string): Record<string, unknown> | null {
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

/**
 * Resolves the JWT signing secret using the following canonical precedence order:
 *
 * 1. LIFEOS_JWT_SECRET (highest priority — preferred explicit path for all deployments)
 * 2. LIFEOS_MASTER_KEY (intentional fallback — allows operators managing a single
 *    master key to avoid a second secret without changing runtime behavior; not the
 *    preferred path and should be replaced by LIFEOS_JWT_SECRET in new deployments)
 * 3. Test-env default ('lifeos-test-secret' when NODE_ENV=test)
 * 4. Dev escape hatch (insecure default when NODE_ENV=development AND
 *    LIFEOS_JWT_ALLOW_INSECURE_DEFAULT=true; emits a console warning)
 * 5. Throw (all other cases — fail fast at startup)
 *
 * Rotation: both LIFEOS_JWT_SECRET and LIFEOS_MASTER_KEY should be rotated on the
 * same schedule. Setting LIFEOS_JWT_SECRET independently is sufficient to rotate the
 * signing secret without touching LIFEOS_MASTER_KEY. After rotation, restart all
 * services that construct JwtService (they read the env at construction time).
 */
function getSigningSecret(): string {
  const configured = process.env.LIFEOS_JWT_SECRET?.trim();
  if (configured) {
    return configured;
  }

  const master = process.env.LIFEOS_MASTER_KEY?.trim();
  if (master) {
    return master;
  }

  if (process.env.NODE_ENV === 'test') {
    return SECURITY_TEST_SIGNING_SECRET;
  }

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT === 'true'
  ) {
    console.warn(
      '[lifeos-security] WARNING: Using insecure default JWT signing secret. ' +
        'Set LIFEOS_JWT_SECRET before deploying.',
    );
    return DEFAULT_SIGNING_SECRET;
  }

  throw new Error(
    'Missing LIFEOS_JWT_SECRET: a signing secret must be set in all non-development ' +
      'environments. For local development only, set NODE_ENV=development and ' +
      'LIFEOS_JWT_ALLOW_INSECURE_DEFAULT=true to use the insecure default.',
  );
}

function getExpiresInSeconds(): number {
  const parsed = Number.parseInt(process.env.LIFEOS_JWT_EXPIRES_IN_SECONDS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_EXPIRES_IN_SECONDS;
}

function parseDefaultScopes(): string[] {
  const configured = process.env.LIFEOS_JWT_DEFAULT_SCOPES?.trim();
  if (!configured) {
    return DEFAULT_SERVICE_SCOPES;
  }

  const scopes = configured
    .split(',')
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => scope.length > 0);

  return scopes.length > 0 ? scopes : DEFAULT_SERVICE_SCOPES;
}

function signJwtPayload(header: string, payload: string, secret: string): string {
  const input = `${header}.${payload}`;
  return base64UrlEncode(createHmac('sha256', secret).update(input).digest());
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export class JwtService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly secret: string;
  private readonly expiresInSeconds: number;

  constructor() {
    this.issuer = process.env.LIFEOS_JWT_ISSUER?.trim() || DEFAULT_ISSUER;
    this.audience = process.env.LIFEOS_JWT_AUDIENCE?.trim() || DEFAULT_AUDIENCE;
    this.secret = getSigningSecret();
    this.validateSigningSecret(this.secret);
    this.expiresInSeconds = getExpiresInSeconds();
  }

  private validateSigningSecret(secret: string): void {
    if (!secret || typeof secret !== 'string') {
      throw new Error('JWT signing secret must be a non-empty string');
    }
  }

  async issue(payload: {
    sub: string;
    service_id: string;
    module_id?: string;
    scopes: string[];
  }): Promise<ServiceToken> {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload: JwtPayload = {
      sub: payload.sub.trim(),
      service_id: payload.service_id.trim(),
      ...(payload.module_id ? { module_id: payload.module_id.trim() } : {}),
      scopes: payload.scopes.map((scope) => scope.trim().toLowerCase()).filter(Boolean),
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      exp: now + this.expiresInSeconds,
    };

    const header = base64UrlEncode(
      JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
      }),
    );
    const body = base64UrlEncode(JSON.stringify(jwtPayload));
    const signature = signJwtPayload(header, body, this.secret);

    return {
      token: `${header}.${body}.${signature}`,
      expiresAt: new Date(jwtPayload.exp * 1000).toISOString(),
    };
  }

  async verify(token: string): Promise<JwtPayload | null> {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }

    const [headerPart, payloadPart, signaturePart] = trimmed.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      return null;
    }

    const parsedHeader = toJsonRecord(base64UrlDecode(headerPart).toString('utf8'));
    const parsedPayload = toJsonRecord(base64UrlDecode(payloadPart).toString('utf8'));
    if (!parsedHeader || !parsedPayload) {
      return null;
    }

    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
      return null;
    }

    const expectedSignature = signJwtPayload(headerPart, payloadPart, this.secret);
    if (!safeEqual(expectedSignature, signaturePart)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = parsedPayload as unknown as JwtPayload;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.service_id !== 'string' ||
      !Array.isArray(payload.scopes) ||
      typeof payload.iss !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    if (payload.exp <= now || payload.iat > now + 60) {
      return null;
    }

    if (payload.iss !== this.issuer) {
      return null;
    }

    if (typeof payload.aud !== 'string' || payload.aud === '' || payload.aud !== this.audience) {
      return null;
    }

    return {
      ...payload,
      scopes: payload.scopes.map((scope) => String(scope).toLowerCase()),
    };
  }
}

export function createSecurityClient(): SecurityClient {
  const jwt = new JwtService();

  return {
    async issueServiceToken(serviceName: string): Promise<ServiceToken> {
      const normalized = serviceName.trim().toLowerCase();
      if (!normalized) {
        throw new Error('serviceName is required');
      }

      return jwt.issue({
        sub: `service:${normalized}`,
        service_id: normalized,
        scopes: parseDefaultScopes(),
      });
    },

    async verifyJwt(token: string): Promise<JwtPayload | null> {
      return jwt.verify(token);
    },

    async getAuthContext(token: string) {
      const payload = await jwt.verify(token);
      if (!payload) {
        return null;
      }

      return {
        subject: payload.sub,
        scopes: payload.scopes,
        service: payload.service_id,
      };
    },
  };
}
