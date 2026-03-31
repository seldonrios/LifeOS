export * from './types';

import { randomUUID } from 'node:crypto';

import type { AutomationFailureSpanInput, ObservabilityClient } from './types';
import type { ObservabilityConfig, TraceContext } from './types';

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  serviceName: string;
  environment: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

function normalizeConfig(config?: Partial<ObservabilityConfig>): ObservabilityConfig {
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

function createTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

function createSpanId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function shouldLogToStdout(level: LogEntry['level']): boolean {
  const configured = (process.env.LIFEOS_OBSERVABILITY_STDOUT ?? 'true').trim().toLowerCase();
  if (configured === 'false' || configured === '0') {
    return level === 'error' || level === 'warn';
  }
  return true;
}

function writeLog(entry: LogEntry): void {
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

export function createObservabilityClient(config?: ObservabilityConfig): ObservabilityClient {
  const resolved = normalizeConfig(config);
  const spanStartTimes = new Map<string, number>();

  return {
    startSpan(name: string, context?: TraceContext): TraceContext {
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

    endSpan(context: TraceContext): void {
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

    recordMetric(name: string, value: number, tags?: Record<string, string>): void {
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

    log(
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      meta?: Record<string, unknown>,
    ): void {
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

export function emitAutomationFailureSpan(
  client: ObservabilityClient,
  spanName: string,
  input: AutomationFailureSpanInput,
): TraceContext {
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
