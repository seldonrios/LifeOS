import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { type HealthCheckResult, HealthCheckResultSchema } from '@lifeos/contracts';
import { createEventBusClient } from '@lifeos/event-bus';
import {
  SECURITY_DEFAULT_SIGNING_SECRET,
  SECURITY_TEST_SIGNING_SECRET,
} from '@lifeos/security';

const PROBE_TIMEOUT_MS = 2000;

function withProbeTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  return fn(controller.signal).finally(() => {
    clearTimeout(timer);
  });
}

export async function probeStorage(): Promise<HealthCheckResult> {
  try {
    return await withProbeTimeout(async (signal) => {
      if (signal.aborted) {
        throw new Error('storage probe timed out');
      }

      const dbPath = process.env.LIFEOS_HOUSEHOLD_DB_PATH?.trim();
      const baseDir = dbPath ? dirname(dbPath) : tmpdir();
      const probePath = join(baseDir, `.lifeos-storage-health-${randomUUID()}.tmp`);
      const value = `ok-${Date.now()}`;

      await writeFile(probePath, value, 'utf8');
      if (signal.aborted) {
        throw new Error('storage probe timed out');
      }

      const loaded = await readFile(probePath, 'utf8');
      await unlink(probePath).catch(() => undefined);

      if (loaded !== value) {
        throw new Error('storage readback mismatch');
      }

      return HealthCheckResultSchema.parse({
        key: 'storage',
        status: 'pass',
        title: 'Storage available',
        detail: 'Local storage read/write succeeded.',
        repairAction: null,
      });
    });
  } catch (error) {
    return HealthCheckResultSchema.parse({
      key: 'storage',
      status: 'fail',
      title: 'Storage unavailable',
      detail: `Storage probe failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      repairAction: {
        label: 'Open settings',
        action: 'open-settings',
      },
    });
  }
}

export async function probeModel(): Promise<HealthCheckResult> {
  try {
    return await withProbeTimeout(async (signal) => {
      const ollamaHost = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
      const response = await fetch(`${ollamaHost}/api/tags`, { signal });

      if (!response.ok) {
        throw new Error(`model endpoint returned ${response.status}`);
      }

      return HealthCheckResultSchema.parse({
        key: 'model',
        status: 'pass',
        title: 'Model runtime reachable',
        detail: `Ollama responded at ${ollamaHost}.`,
        repairAction: null,
      });
    });
  } catch (error) {
    return HealthCheckResultSchema.parse({
      key: 'model',
      status: 'fail',
      title: 'Model runtime unavailable',
      detail: `Could not reach Ollama: ${error instanceof Error ? error.message : 'unknown error'}`,
      repairAction: {
        label: 'Check Ollama service',
        action: 'check-ollama',
      },
    });
  }
}

export async function probeEventBus(
  factory: typeof createEventBusClient = createEventBusClient,
): Promise<HealthCheckResult> {
  const eventBus = factory({
    env: process.env,
    allowInMemoryFallback: false,
    timeoutMs: PROBE_TIMEOUT_MS,
  });

  try {
    return await withProbeTimeout(async () => {
      const transport = eventBus.getTransport();
      const natsConfigured = Boolean(process.env.LIFEOS_NATS_URL?.trim());
      if (transport === 'nats') {
        return HealthCheckResultSchema.parse({
          key: 'eventBus',
          status: 'pass',
          title: 'Event bus connected',
          detail: 'NATS transport is connected.',
          repairAction: null,
        });
      }

      if (natsConfigured) {
        return HealthCheckResultSchema.parse({
          key: 'eventBus',
          status: 'pass',
          title: 'Event bus configured',
          detail: 'LIFEOS_NATS_URL is configured.',
          repairAction: null,
        });
      }

      return HealthCheckResultSchema.parse({
        key: 'eventBus',
        status: 'fail',
        title: 'Event bus unavailable',
        detail: `No active event bus transport (${transport}) and LIFEOS_NATS_URL is not configured.`,
        repairAction: {
          label: 'Check NATS connectivity',
          action: 'check-nats',
        },
      });
    });
  } catch (error) {
    return HealthCheckResultSchema.parse({
      key: 'eventBus',
      status: 'fail',
      title: 'Event bus unavailable',
      detail: `Failed to verify event bus availability: ${error instanceof Error ? error.message : 'unknown error'}`,
      repairAction: {
        label: 'Check NATS connectivity',
        action: 'check-nats',
      },
    });
  } finally {
    await eventBus.close();
  }
}

export async function probeSync(): Promise<HealthCheckResult> {
  return HealthCheckResultSchema.parse({
    key: 'sync',
    status: 'warn',
    title: 'Sync probe pending',
    detail: 'Sync health probing is not implemented yet.',
    repairAction: {
      label: 'Open settings',
      action: 'open-settings',
    },
  });
}

const INSECURE_SECRET_VALUES = new Set([
  'changeme',
  'change-me',
  'change_me',
  'secret',
  'default',
  'dev-secret',
  'test-secret',
  SECURITY_DEFAULT_SIGNING_SECRET,
  SECURITY_TEST_SIGNING_SECRET,
]);

function isSecureSecret(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 16) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  if (INSECURE_SECRET_VALUES.has(lowered)) {
    return false;
  }

  if (lowered.includes('change-me') || lowered.includes('changeme')) {
    return false;
  }

  return true;
}

export async function probeNotifications(): Promise<HealthCheckResult> {
  try {
    return await withProbeTimeout(async () => {
      const enabled = (process.env.LIFEOS_NOTIFICATIONS_ENABLED ?? '').trim().toLowerCase();
      const truthy = enabled === '1' || enabled === 'true' || enabled === 'yes' || enabled === 'on';

      if (truthy) {
        return HealthCheckResultSchema.parse({
          key: 'notifications',
          status: 'pass',
          title: 'Notifications configured',
          detail: 'Notification delivery is enabled.',
          repairAction: null,
        });
      }

      return HealthCheckResultSchema.parse({
        key: 'notifications',
        status: 'warn',
        title: 'Notifications disabled',
        detail: 'Notification delivery is not enabled in environment configuration.',
        repairAction: {
          label: 'Configure notifications',
          action: 'configure-notifications',
        },
      });
    });
  } catch (error) {
    return HealthCheckResultSchema.parse({
      key: 'notifications',
      status: 'warn',
      title: 'Notification status unknown',
      detail: `Notification probe fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
      repairAction: {
        label: 'Configure notifications',
        action: 'configure-notifications',
      },
    });
  }
}

export async function probeAuth(): Promise<HealthCheckResult> {
  try {
    return await withProbeTimeout(async () => {
      const jwtSecret = process.env.LIFEOS_JWT_SECRET?.trim() ?? '';
      const masterKey = process.env.LIFEOS_MASTER_KEY?.trim() ?? '';
      const hasJwtSecret = jwtSecret.length > 0;
      const hasMasterKey = masterKey.length > 0;

      if (hasJwtSecret && isSecureSecret(jwtSecret)) {
        return HealthCheckResultSchema.parse({
          key: 'auth',
          status: 'pass',
          title: 'Auth secrets configured',
          detail: 'LIFEOS_JWT_SECRET is configured and non-default.',
          repairAction: null,
        });
      }

      if (!hasJwtSecret && hasMasterKey && isSecureSecret(masterKey)) {
        return HealthCheckResultSchema.parse({
          key: 'auth',
          status: 'warn',
          title: 'Auth using master key fallback',
          detail: 'LIFEOS_MASTER_KEY is set, but LIFEOS_JWT_SECRET is not configured.',
          repairAction: {
            label: 'Set JWT secret',
            action: 'set-jwt-secret',
          },
        });
      }

      if (hasJwtSecret || hasMasterKey) {
        return HealthCheckResultSchema.parse({
          key: 'auth',
          status: 'fail',
          title: 'Auth secret insecure',
          detail: 'LIFEOS_JWT_SECRET must be set to a non-default, high-entropy value.',
          repairAction: {
            label: 'Set JWT secret',
            action: 'set-jwt-secret',
          },
        });
      }

      return HealthCheckResultSchema.parse({
        key: 'auth',
        status: 'fail',
        title: 'Auth secret missing',
        detail: 'LIFEOS_JWT_SECRET or LIFEOS_MASTER_KEY must be configured.',
        repairAction: {
          label: 'Set JWT secret',
          action: 'set-jwt-secret',
        },
      });
    });
  } catch (error) {
    return HealthCheckResultSchema.parse({
      key: 'auth',
      status: 'fail',
      title: 'Auth validation failed',
      detail: `Auth probe failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      repairAction: {
        label: 'Set JWT secret',
        action: 'set-jwt-secret',
      },
    });
  }
}

export type UxProbes = {
  probeStorage: () => Promise<HealthCheckResult>;
  probeModel: () => Promise<HealthCheckResult>;
  probeEventBus: () => Promise<HealthCheckResult>;
  probeNotifications: () => Promise<HealthCheckResult>;
  probeSync: () => Promise<HealthCheckResult>;
  probeAuth: () => Promise<HealthCheckResult>;
};

const defaultProbes: UxProbes = {
  probeStorage,
  probeModel,
  probeEventBus,
  probeNotifications,
  probeSync,
  probeAuth,
};

export function registerUxRoutes(app: FastifyInstance, probes: UxProbes = defaultProbes): void {
  app.route({
    method: 'GET',
    url: '/api/ux/health',
    config: { accessMode: 'public' },
    handler: async () => {
      return Promise.all([
        probes.probeStorage(),
        probes.probeModel(),
        probes.probeEventBus(),
        probes.probeNotifications(),
        probes.probeSync(),
        probes.probeAuth(),
      ]);
    },
  });
}
