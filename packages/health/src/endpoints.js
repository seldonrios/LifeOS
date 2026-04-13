function collectReasons(status) {
    return Object.entries(status.checks)
        .filter(([, value]) => value.reason)
        .map(([name, value]) => `${name}: ${value.reason}`);
}
export function livenessHandler(registry) {
    void registry;
    return async () => ({
        status: 200,
        body: {
            status: 'healthy',
        },
    });
}
export function readinessHandler(registry) {
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
export function startupHandler(registry) {
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
