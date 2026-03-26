import { describe, expect, it } from 'vitest';

import { createPolicyClient } from './index';

describe('policy-engine', () => {
  it('allows safe module permissions', async () => {
    const client = createPolicyClient();
    const result = await client.evaluatePolicy({
      subject: 'calendar',
      action: 'module.load',
      resource: 'lifeos.module',
      context: {
        permissions: {
          graph: ['read', 'append'],
          voice: ['speak'],
          network: ['calendar'],
          events: ['subscribe:lifeos.tick.overdue', 'publish:lifeos.calendar.event.added'],
        },
      },
    });

    expect(result.allowed).toBe(true);
  });

  it('denies broad wildcard subscriptions for non-system modules', async () => {
    const client = createPolicyClient();
    const result = await client.evaluatePolicy({
      subject: 'calendar',
      action: 'module.load',
      resource: 'lifeos.module',
      context: {
        permissions: {
          graph: ['read'],
          voice: [],
          network: [],
          events: ['subscribe:lifeos.>'],
        },
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/too broad/i);
  });

  it('allows wildcard subscriptions for trusted system modules', async () => {
    const client = createPolicyClient();
    const result = await client.evaluatePolicy({
      subject: 'orchestrator',
      action: 'module.load',
      resource: 'lifeos.module',
      context: {
        permissions: {
          graph: ['read', 'write'],
          voice: ['speak'],
          network: [],
          events: ['subscribe:lifeos.>', 'publish:lifeos.orchestrator.suggestion'],
        },
      },
    });

    expect(result.allowed).toBe(true);
  });

  it('denies unknown module permissions', async () => {
    const client = createPolicyClient();
    const result = await client.evaluatePolicy({
      subject: 'danger-module',
      action: 'module.load',
      resource: 'lifeos.module',
      context: {
        permissions: {
          graph: ['drop_database'],
          voice: [],
          network: [],
          events: [],
        },
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });

  it('supports explicit scope checks', () => {
    const client = createPolicyClient();
    const allowed = client.checkPermission('event_publish', {
      subject: 'service:module-loader',
      action: 'permission.check',
      resource: 'lifeos.policy',
      context: {
        scopes: ['event.publish'],
      },
    });

    expect(allowed).toBe(true);
  });
});
