import type { HealthCheck, HealthCheckResult, HealthStatus } from './types';

export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck['check']>();

  register(check: HealthCheck): void {
    this.checks.set(check.name, check.check);
  }

  async runAll(): Promise<HealthStatus> {
    const entries = [...this.checks.entries()];
    const results = await Promise.all(
      entries.map(async ([name, check]) => {
        try {
          const result = await check();
          return [name, result] as const;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Health check failed.';
          const failed: HealthCheckResult = {
            status: 'unhealthy',
            reason,
          };
          return [name, failed] as const;
        }
      }),
    );

    const checks: Record<string, HealthCheckResult> = Object.fromEntries(results);
    const statuses = Object.values(checks).map((result) => result.status);

    const status = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status,
      checks,
    };
  }
}
