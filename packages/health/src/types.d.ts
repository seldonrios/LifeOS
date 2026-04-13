export interface HealthCheck {
    name: string;
    check: () => Promise<HealthCheckResult>;
}
export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    reason?: string;
}
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, HealthCheckResult>;
}
