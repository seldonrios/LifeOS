import { afterEach, describe, expect, it } from 'vitest';

import { JwtService, createSecurityClient } from './index';

const ENV_KEYS = [
  'LIFEOS_JWT_SECRET',
  'LIFEOS_JWT_ISSUER',
  'LIFEOS_JWT_AUDIENCE',
  'LIFEOS_JWT_EXPIRES_IN_SECONDS',
  'LIFEOS_JWT_DEFAULT_SCOPES',
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

    const [head, body, signature] = token.token.split('.');
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
