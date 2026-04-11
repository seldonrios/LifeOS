import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import { JwtService, createSecurityClient } from './index';

const ENV_KEYS = [
  'LIFEOS_JWT_SECRET',
  'LIFEOS_MASTER_KEY',
  'LIFEOS_JWT_ISSUER',
  'LIFEOS_JWT_AUDIENCE',
  'LIFEOS_JWT_EXPIRES_IN_SECONDS',
  'LIFEOS_JWT_DEFAULT_SCOPES',
  'NODE_ENV',
  'LIFEOS_JWT_ALLOW_INSECURE_DEFAULT',
];

const previousEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  previousEnv.set(key, process.env[key]);
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = previousEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

describe('security client', () => {
  it('issues and verifies service tokens', async () => {
    process.env.LIFEOS_JWT_SECRET = 'test-secret';
    process.env.LIFEOS_JWT_ISSUER = 'lifeos.test';
    process.env.LIFEOS_JWT_AUDIENCE = 'lifeos.services';
    const client = createSecurityClient();

    const token = await client.issueServiceToken('goal-engine');
    expect(token.token).toContain('.');
    expect(token.expiresAt).toMatch(/T/);

    const payload = await client.verifyJwt(token.token);
    expect(payload?.sub).toBe('service:goal-engine');
    expect(payload?.service_id).toBe('goal-engine');
    expect(Array.isArray(payload?.scopes)).toBe(true);
  });

  it('rejects tampered tokens', async () => {
    process.env.LIFEOS_JWT_SECRET = 'test-secret';
    const client = createSecurityClient();
    const token = await client.issueServiceToken('module-loader');

    const [head = '', body = '', signature = ''] = token.token.split('.');
    const tamperedBody = body.slice(0, -1) + (body.endsWith('a') ? 'b' : 'a');
    const tampered = `${head}.${tamperedBody}.${signature}`;
    const payload = await client.verifyJwt(tampered);

    expect(payload).toBeNull();
  });

  it('rejects expired tokens', async () => {
    process.env.LIFEOS_JWT_SECRET = 'test-secret';
    process.env.LIFEOS_JWT_EXPIRES_IN_SECONDS = '1';
    const jwt = new JwtService();
    const issued = await jwt.issue({
      sub: 'service:short-lived',
      service_id: 'short-lived',
      scopes: ['service.read'],
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });

    const payload = await jwt.verify(issued.token);
    expect(payload).toBeNull();
  });
});

describe('JwtService constructor — secret policy', () => {
  it('throws in production when no secret is set', () => {
    delete process.env.LIFEOS_JWT_SECRET;
    delete process.env.LIFEOS_MASTER_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => new JwtService()).toThrow();
  });

  it('throws in development without escape hatch', () => {
    delete process.env.LIFEOS_JWT_SECRET;
    delete process.env.LIFEOS_MASTER_KEY;
    process.env.NODE_ENV = 'development';
    delete process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT;
    expect(() => new JwtService()).toThrow();
  });

  it('warns but succeeds in development with escape hatch', () => {
    delete process.env.LIFEOS_JWT_SECRET;
    delete process.env.LIFEOS_MASTER_KEY;
    process.env.NODE_ENV = 'development';
    process.env.LIFEOS_JWT_ALLOW_INSECURE_DEFAULT = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => new JwtService()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('succeeds in test env without secret', () => {
    delete process.env.LIFEOS_JWT_SECRET;
    delete process.env.LIFEOS_MASTER_KEY;
    process.env.NODE_ENV = 'test';
    expect(() => new JwtService()).not.toThrow();
  });

  it('succeeds in any env when secret is explicitly set', () => {
    process.env.NODE_ENV = 'production';
    process.env.LIFEOS_JWT_SECRET = 'explicit-secret';
    expect(() => new JwtService()).not.toThrow();
  });
});

describe('JwtService.verify() — aud enforcement', () => {
  function base64UrlEncode(input: Buffer | string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function makeTestToken(payload: Record<string, unknown>, secret: string): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(
      createHmac('sha256', secret).update(`${header}.${body}`).digest(),
    );
    return `${header}.${body}.${signature}`;
  }

  const TEST_SECRET = 'test-secret-aud';

  const basePayload = () => {
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: 'service:test',
      service_id: 'test',
      scopes: ['service.read'],
      iss: 'lifeos.local',
      iat: now,
      exp: now + 1800,
    };
  };

  it('rejects tokens with absent aud', async () => {
    process.env.LIFEOS_JWT_SECRET = TEST_SECRET;
    const jwt = new JwtService();
    const token = makeTestToken({ ...basePayload() }, TEST_SECRET);
    expect(await jwt.verify(token)).toBeNull();
  });

  it('rejects tokens with empty string aud', async () => {
    process.env.LIFEOS_JWT_SECRET = TEST_SECRET;
    const jwt = new JwtService();
    const token = makeTestToken({ ...basePayload(), aud: '' }, TEST_SECRET);
    expect(await jwt.verify(token)).toBeNull();
  });

  it('rejects tokens with wrong aud', async () => {
    process.env.LIFEOS_JWT_SECRET = TEST_SECRET;
    const jwt = new JwtService();
    const token = makeTestToken({ ...basePayload(), aud: 'other-audience' }, TEST_SECRET);
    expect(await jwt.verify(token)).toBeNull();
  });

  it('accepts tokens with correct aud', async () => {
    process.env.LIFEOS_JWT_SECRET = TEST_SECRET;
    const jwt = new JwtService();
    const token = makeTestToken({ ...basePayload(), aud: 'lifeos.services' }, TEST_SECRET);
    const result = await jwt.verify(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('service:test');
  });
});
