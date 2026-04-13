import type { HealthCheck, HealthStatus } from './types';
export declare class HealthRegistry {
    private readonly checks;
    register(check: HealthCheck): void;
    runAll(): Promise<HealthStatus>;
}
