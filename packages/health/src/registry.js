export class HealthRegistry {
    checks = new Map();
    register(check) {
        this.checks.set(check.name, check.check);
    }
    async runAll() {
        const entries = [...this.checks.entries()];
        const results = await Promise.all(entries.map(async ([name, check]) => {
            try {
                const result = await check();
                return [name, result];
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Health check failed.';
                const failed = {
                    status: 'unhealthy',
                    reason,
                };
                return [name, failed];
            }
        }));
        const checks = Object.fromEntries(results);
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
