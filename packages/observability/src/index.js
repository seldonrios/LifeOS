export * from './types';
import { randomUUID } from 'node:crypto';
function normalizeConfig(config) {
    const serviceName = config?.serviceName?.trim();
    const environment = config?.environment?.trim();
    if (!serviceName) {
        throw new Error('observability config requires serviceName');
    }
    if (!environment) {
        throw new Error('observability config requires environment');
    }
    return {
        serviceName,
        environment,
        ...(config?.endpoint?.trim() ? { endpoint: config.endpoint.trim() } : {}),
    };
}
function createTraceId() {
    return randomUUID().replace(/-/g, '');
}
function createSpanId() {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}
function shouldLogToStdout(level) {
    const configured = (process.env.LIFEOS_OBSERVABILITY_STDOUT ?? 'true').trim().toLowerCase();
    if (configured === 'false' || configured === '0') {
        return level === 'error' || level === 'warn';
    }
    return true;
}
function writeLog(entry) {
    if (!shouldLogToStdout(entry.level)) {
        return;
    }
    const serialized = JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'warn') {
        process.stderr.write(`${serialized}\n`);
        return;
    }
    process.stdout.write(`${serialized}\n`);
}
export function createObservabilityClient(config) {
    const resolved = normalizeConfig(config);
    const spanStartTimes = new Map();
    return {
        startSpan(name, context) {
            const span = {
                traceId: context?.traceId ?? createTraceId(),
                spanId: createSpanId(),
                ...(context?.spanId ? { parentSpanId: context.spanId } : {}),
            };
            spanStartTimes.set(span.spanId, Date.now());
            writeLog({
                level: 'debug',
                message: `span.start:${name}`,
                serviceName: resolved.serviceName,
                environment: resolved.environment,
                timestamp: new Date().toISOString(),
                meta: {
                    traceId: span.traceId,
                    spanId: span.spanId,
                    parentSpanId: span.parentSpanId,
                },
            });
            return span;
        },
        endSpan(context) {
            const startedAt = spanStartTimes.get(context.spanId);
            spanStartTimes.delete(context.spanId);
            const durationMs = startedAt ? Date.now() - startedAt : undefined;
            writeLog({
                level: 'debug',
                message: 'span.end',
                serviceName: resolved.serviceName,
                environment: resolved.environment,
                timestamp: new Date().toISOString(),
                meta: {
                    traceId: context.traceId,
                    spanId: context.spanId,
                    ...(context.parentSpanId ? { parentSpanId: context.parentSpanId } : {}),
                    ...(durationMs !== undefined ? { durationMs } : {}),
                },
            });
        },
        recordMetric(name, value, tags) {
            writeLog({
                level: 'info',
                message: `metric:${name}`,
                serviceName: resolved.serviceName,
                environment: resolved.environment,
                timestamp: new Date().toISOString(),
                meta: {
                    value,
                    ...(tags ? { tags } : {}),
                },
            });
        },
        log(level, message, meta) {
            writeLog({
                level,
                message,
                serviceName: resolved.serviceName,
                environment: resolved.environment,
                timestamp: new Date().toISOString(),
                ...(meta ? { meta } : {}),
            });
        },
    };
}
export function emitAutomationFailureSpan(client, spanName, input) {
    const span = client.startSpan(spanName);
    client.log('error', `automation.failure:${input.errorCode}`, {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        household_id: input.householdId,
        actor_id: input.actorId,
        action_type: input.actionType,
        error_code: input.errorCode,
        fix_suggestion: input.fixSuggestion,
        ...(input.objectId ? { object_id: input.objectId } : {}),
        ...(input.objectRef ? { object_ref: input.objectRef } : {}),
        ...(input.details ? input.details : {}),
    });
    client.endSpan(span);
    return span;
}
//# sourceMappingURL=index.js.map