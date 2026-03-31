export * from './types';
import type { AutomationFailureSpanInput, ObservabilityClient } from './types';
import type { ObservabilityConfig, TraceContext } from './types';
export declare function createObservabilityClient(config?: ObservabilityConfig): ObservabilityClient;
export declare function emitAutomationFailureSpan(client: ObservabilityClient, spanName: string, input: AutomationFailureSpanInput): TraceContext;
//# sourceMappingURL=index.d.ts.map