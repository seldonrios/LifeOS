export * from './types';
import fastify from 'fastify';
import { loadConfig } from '@lifeos/config';
import { HealthRegistry, livenessHandler, readinessHandler } from '@lifeos/health';
import { createObservabilityClient, } from '@lifeos/observability';
import { createPolicyClient } from '@lifeos/policy-engine';
import { createSecurityClient } from '@lifeos/security';
import { applySecretPolicy, SecretsError } from '@lifeos/secrets';
function createNoopObservabilityClient() {
    return {
        startSpan: () => ({
            traceId: 'noop-trace',
            spanId: 'noop-span',
        }),
        endSpan: () => {
            return;
        },
        recordMetric: () => {
            return;
        },
        log: () => {
            return;
        },
    };
}
export function createEnvSecretStore() {
    return {
        get: async (name) => process.env[name] ?? null,
        set: async () => undefined,
    };
}
/**
 * Validates and normalizes the service port.
 * @throws Error if port is invalid
 */
function validatePort(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port number: ${port}. Must be between 1 and 65535.`);
    }
    return port;
}
/**
 * Validates and normalizes the binding host.
 * Prevents binding to all interfaces without explicit configuration.
 * @throws Error if host is invalid
 */
function validateHost(host) {
    if (!host || host.trim().length === 0) {
        // Default to localhost in development, explicit in production
        const env = process.env.NODE_ENV ?? 'development';
        return env === 'production' ? 'localhost' : '127.0.0.1';
    }
    const normalized = host.trim();
    // Warn about 0.0.0.0 binding outside production
    if (normalized === '0.0.0.0' && process.env.NODE_ENV !== 'production') {
        console.warn('[service-runtime] WARNING: Binding to 0.0.0.0 outside production. Consider using localhost or an explicit IP.');
    }
    // Only allow safe host patterns
    if (!/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9][a-z0-9-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*[a-z0-9])*$|^localhost$|^::1$|^::.?$/i.test(normalized)) {
        throw new Error(`Invalid host: ${normalized}. Must be a valid IPv4, IPv6, or hostname.`);
    }
    return normalized;
}
function terminateBoot(error, message) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${message}: ${detail}`);
    process.exit(1);
    throw error instanceof Error ? error : new Error(detail);
}
function shouldEnforceMutatingAuth(method) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}
function shouldEnforceAuth(method, path, mode) {
    if (mode === 'all') {
        return true;
    }
    if (mode === 'api-prefix') {
        return path.startsWith('/api/');
    }
    return shouldEnforceMutatingAuth(method);
}
function resolveRouteAccessMode(request) {
    const routeConfig = request.routeOptions.config;
    const configuredAccessMode = routeConfig?.accessMode ??
        routeConfig?.config?.accessMode ??
        request.routeConfig?.accessMode;
    if (configuredAccessMode === 'inherit' ||
        configuredAccessMode === 'bearer' ||
        configuredAccessMode === 'surface-secret' ||
        configuredAccessMode === 'public') {
        return configuredAccessMode;
    }
    return 'inherit';
}
function resolveAuthPolicy(opts, configSecurity) {
    const hasLegacyAuthFlags = opts.enforceMutatingRouteAuth !== undefined || opts.enableAuth !== undefined;
    if (opts.enforceRouteAuthMode !== undefined) {
        if (hasLegacyAuthFlags) {
            console.warn(`[service-runtime] ${opts.serviceName}: enforceRouteAuthMode is set; enableAuth and enforceMutatingRouteAuth are deprecated and ignored.`);
        }
        return {
            mode: opts.enforceRouteAuthMode,
            enabled: true,
        };
    }
    if (opts.enforceMutatingRouteAuth !== undefined) {
        return {
            mode: 'mutating',
            enabled: opts.enforceMutatingRouteAuth,
        };
    }
    if (opts.enableAuth !== undefined) {
        return {
            mode: 'mutating',
            enabled: opts.enableAuth,
        };
    }
    if (configSecurity?.policyEnforce !== undefined) {
        return {
            mode: 'mutating',
            enabled: configSecurity.policyEnforce,
        };
    }
    return {
        mode: 'mutating',
        enabled: true,
    };
}
function extractBearerToken(value) {
    if (!value) {
        return null;
    }
    const [scheme, token] = value.trim().split(/\s+/, 2);
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }
    return token.trim() || null;
}
export async function startService(opts) {
    // Validate input immediately
    if (!opts.serviceName || opts.serviceName.trim().length === 0) {
        terminateBoot(new Error('serviceName is required'), 'Service initialization failed');
    }
    const markPhase = async (phase) => {
        await opts.onPhase?.(phase);
    };
    // Track degraded secrets for health checks
    const allDegradedSecrets = [];
    let resolvedConfig;
    await markPhase('config');
    try {
        const loaded = await loadConfig({
            secretStore: opts.secretStore,
            secretRefs: opts.secretRefs,
            isFeatureEnabled: opts.isFeatureEnabled,
        });
        resolvedConfig = loaded.config;
        for (const marker of loaded.degraded) {
            allDegradedSecrets.push({ reason: marker.reason });
        }
    }
    catch (error) {
        terminateBoot(error, 'Failed to load configuration');
    }
    await markPhase('secrets');
    for (const ref of opts.secretRefs ?? []) {
        const value = (await opts.secretStore?.get(ref.name)) ?? null;
        let featureEnabled;
        if (ref.policy === 'required_if_feature_enabled') {
            if (opts.isFeatureEnabled) {
                featureEnabled = await opts.isFeatureEnabled(ref.featureGate ?? '');
            }
            else {
                featureEnabled = resolvedConfig.features?.[ref.featureGate ?? ''];
            }
        }
        try {
            const outcome = applySecretPolicy(ref, value, featureEnabled);
            if (typeof outcome !== 'string') {
                allDegradedSecrets.push({ reason: outcome.reason });
            }
        }
        catch (error) {
            if (error instanceof SecretsError) {
                terminateBoot(error, '[service-runtime] boot aborted');
            }
            throw error;
        }
    }
    if (allDegradedSecrets.length > 0) {
        console.warn(JSON.stringify({
            message: 'service starting with degraded secrets',
            serviceName: opts.serviceName,
            degradedSecrets: allDegradedSecrets.map((m) => m.reason),
        }));
    }
    const observabilityConfig = opts.observabilityConfig ?? {
        serviceName: opts.serviceName,
        environment: resolvedConfig.profile ?? 'development',
    };
    await markPhase('observability');
    const createObservability = opts.observabilityFactory ??
        ((config) => createObservabilityClient(config));
    let observabilityClient;
    try {
        observabilityClient = createObservability(observabilityConfig);
    }
    catch (error) {
        if (opts.allowObservabilityInitFallback === false) {
            terminateBoot(error, 'Failed to initialize observability');
        }
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[service-runtime] observability initialization failed, falling back to noop: ${detail}`);
        observabilityClient = createNoopObservabilityClient();
    }
    const app = fastify({ logger: true, requestTimeout: 30_000 });
    // Add security headers middleware
    app.addHook('onSend', async (request, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        if (process.env.NODE_ENV === 'production') {
            reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        reply.header('Content-Security-Policy', "default-src 'self'");
        reply.header('Referrer-Policy', 'no-referrer');
        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // Do not expose server version
        reply.header('Server', 'LifeOS');
    });
    await markPhase('auth/policy');
    const configSecurity = resolvedConfig.security;
    const failClosed = opts.failClosed ?? configSecurity?.failClosed ?? true;
    const authPolicy = resolveAuthPolicy(opts, configSecurity);
    const securityClient = createSecurityClient();
    const policyClient = createPolicyClient();
    app.addHook('onRequest', async (request, reply) => {
        request.log.info({ serviceName: opts.serviceName }, 'service identity');
        if (request.url.startsWith('/health/')) {
            return;
        }
        const routeAccessMode = resolveRouteAccessMode(request);
        if (routeAccessMode === 'public' || routeAccessMode === 'surface-secret') {
            return;
        }
        const enforceBearerAuth = routeAccessMode === 'bearer' ||
            (routeAccessMode === 'inherit' &&
                authPolicy.enabled &&
                shouldEnforceAuth(request.method, request.url, authPolicy.mode));
        if (!enforceBearerAuth) {
            return;
        }
        const authorization = request.headers.authorization;
        const token = extractBearerToken(Array.isArray(authorization) ? authorization[0] : authorization);
        if (!token) {
            observabilityClient.log('warn', 'mutating request denied: missing bearer token', {
                topic: 'lifeos.security.auth.failed',
                serviceName: opts.serviceName,
                method: request.method,
                path: request.url,
            });
            reply.code(401).send({ error: 'Invalid or expired token' });
            return reply;
        }
        let payload = null;
        try {
            payload = await securityClient.verifyJwt(token);
        }
        catch (error) {
            if (failClosed) {
                observabilityClient.log('error', 'mutating request denied: jwt verification failed', {
                    topic: 'lifeos.security.auth.failed',
                    serviceName: opts.serviceName,
                    method: request.method,
                    path: request.url,
                    error: error instanceof Error ? error.message : String(error),
                });
                reply.code(401).send({ error: 'Invalid or expired token' });
                return reply;
            }
            return;
        }
        if (!payload) {
            observabilityClient.log('warn', 'mutating request denied: invalid token', {
                topic: 'lifeos.security.auth.failed',
                serviceName: opts.serviceName,
                method: request.method,
                path: request.url,
            });
            reply.code(401).send({ error: 'Invalid or expired token' });
            return reply;
        }
        const policyResult = await policyClient.evaluatePolicy({
            subject: payload.sub,
            action: `service.${opts.serviceName}.${request.method.toLowerCase()}`,
            resource: request.url.split('?')[0] ?? request.url,
            context: {
                serviceName: opts.serviceName,
                method: request.method,
                path: request.url,
                scopes: payload.scopes,
            },
        });
        if (!policyResult.allowed) {
            observabilityClient.log('warn', 'mutating request denied: policy rejection', {
                topic: 'lifeos.security.policy.denied',
                serviceName: opts.serviceName,
                method: request.method,
                path: request.url,
                reason: policyResult.reason,
            });
            reply.code(403).send({ error: policyResult.reason ?? 'Policy denied mutating request' });
            return reply;
        }
    });
    try {
        await opts.onAuthPolicy?.(resolvedConfig);
    }
    catch (error) {
        terminateBoot(error, 'Failed to initialize auth/policy');
    }
    try {
        await opts.registerPlugins?.(app);
    }
    catch (error) {
        terminateBoot(error, 'Failed to register plugins');
    }
    await markPhase('routes');
    try {
        const registerRoutesHandler = opts.registerRoutes ??
            (async () => {
                return;
            });
        await registerRoutesHandler(app);
    }
    catch (error) {
        terminateBoot(error, 'Failed to register routes');
    }
    await markPhase('health/readiness');
    const healthRegistry = new HealthRegistry();
    for (const healthCheck of opts.healthChecks ?? []) {
        healthRegistry.register(healthCheck);
    }
    healthRegistry.register({
        name: 'secrets',
        check: async () => {
            if (allDegradedSecrets.length === 0) {
                return { status: 'healthy' };
            }
            return {
                status: 'degraded',
                reason: allDegradedSecrets.map((marker) => marker.reason).join('; '),
            };
        },
    });
    healthRegistry.register({
        name: 'liveness',
        check: async () => ({
            status: 'healthy',
        }),
    });
    let readinessInProgress = false;
    healthRegistry.register({
        name: 'readiness',
        check: async () => {
            if (readinessInProgress) {
                return { status: 'healthy' };
            }
            readinessInProgress = true;
            try {
                const aggregate = await healthRegistry.runAll();
                return { status: aggregate.status };
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Health check failed';
                return { status: 'unhealthy', reason };
            }
            finally {
                readinessInProgress = false;
            }
        },
    });
    if (opts.enableLiveness !== false) {
        app.get('/health/live', async (_request, reply) => {
            try {
                const response = await livenessHandler(healthRegistry)();
                reply.code(response.status).send(response.body);
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                reply.code(500).send({ error: `Liveness check failed: ${detail}` });
            }
        });
    }
    if (opts.enableReadiness !== false) {
        app.get('/health/ready', async (_request, reply) => {
            try {
                const response = await readinessHandler(healthRegistry)();
                reply.code(response.status).send(response.body);
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : 'Unknown error';
                reply.code(500).send({ error: `Readiness check failed: ${detail}` });
            }
        });
    }
    await markPhase('listen');
    let validatedPort;
    let validatedHost;
    try {
        const rawPort = opts.port ?? Number(process.env.PORT ?? 3000);
        validatedPort = validatePort(rawPort);
    }
    catch (error) {
        terminateBoot(error, 'Invalid port configuration');
    }
    try {
        validatedHost = validateHost(process.env.HOST);
    }
    catch (error) {
        terminateBoot(error, 'Invalid host configuration');
    }
    try {
        await opts.onBeforeListen?.(app);
    }
    catch (error) {
        terminateBoot(error, 'Failed to initialize listen hook');
    }
    if (opts.skipListen) {
        return;
    }
    try {
        await app.listen({ port: validatedPort, host: validatedHost });
    }
    catch (error) {
        terminateBoot(error, 'Failed to start listening');
    }
    observabilityClient.log('info', `${opts.serviceName} listening`, {
        serviceName: opts.serviceName,
        port: validatedPort,
        host: validatedHost,
    });
    // Graceful shutdown handling
    const gracefulShutdown = async () => {
        console.log(`[service-runtime] Shutting down ${opts.serviceName} gracefully...`);
        try {
            await app.close();
            console.log(`[service-runtime] ${opts.serviceName} shutdown complete.`);
        }
        catch (error) {
            console.error(`[service-runtime] Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    process.on('SIGTERM', () => {
        void gracefulShutdown();
    });
    process.on('SIGINT', () => {
        void gracefulShutdown();
    });
}
