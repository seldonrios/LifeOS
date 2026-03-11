import type { HealthCheckResult } from '@lifeos/health';

export interface ServiceRuntimeOptions {
  serviceName: string;
  port: number;
  configPath?: string;
  healthCheckPath?: string;
}

export interface ServiceRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): HealthCheckResult;
}
