export * from './types';
import type { ManagedEventBus } from './types';
export interface CreateEventBusClientOptions {
    env?: NodeJS.ProcessEnv;
    servers?: string | string[];
    name?: string;
    timeoutMs?: number;
    maxReconnectAttempts?: number;
    logger?: (message: string) => void;
    allowInMemoryFallback?: boolean;
}
export declare function createEventBusClient(options?: CreateEventBusClientOptions): ManagedEventBus;
export declare function bootstrapStreams(options?: CreateEventBusClientOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map