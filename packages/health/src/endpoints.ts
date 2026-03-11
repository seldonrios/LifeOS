import type { HealthStatus } from './types';
import { HealthRegistry } from './registry';

interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

function collectReasons(status: HealthStatus): string[] {
  return Object.entries(status.checks)
    .filter(([, value]) => value.reason)
    .map(([name, value]) => `${name}: ${value.reason as string}`);
}

export function livenessHandler(registry: HealthRegistry): () => Promise<HandlerResponse> {
  void registry;
  return async () => ({
    status: 200,
    body: {
      status: 'healthy',
    },
  });
}

export function readinessHandler(registry: HealthRegistry): () => Promise<HandlerResponse> {
  return async () => {
    const status = await registry.runAll();
    const reasons = collectReasons(status);

    return {
      status: status.status === 'healthy' ? 200 : 503,
      body: {
        status: status.status,
        checks: status.checks,
        reasons,
      },
    };
  };
}

export function startupHandler(registry: HealthRegistry): () => Promise<HandlerResponse> {
  return async () => {
    const status = await registry.runAll();
    const reasons = collectReasons(status);

    return {
      status: status.status === 'healthy' ? 200 : 503,
      body: {
        status: status.status,
        checks: status.checks,
        reasons,
      },
    };
  };
}
