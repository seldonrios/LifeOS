export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface ObservabilityConfig {
  serviceName: string;
  environment: string;
  endpoint?: string;
}

export interface ObservabilityClient {
  startSpan(name: string, context?: TraceContext): TraceContext;
  endSpan(context: TraceContext): void;
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void;
}
