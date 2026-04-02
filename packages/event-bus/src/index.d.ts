export * from './types';
import { connect } from 'nats';
import type { ManagedEventBus } from './types';
export interface CreateEventBusClientOptions {
    env?: NodeJS.ProcessEnv;
    servers?: string | string[];
    name?: string;
    timeoutMs?: number;
    maxReconnectAttempts?: number;
    logger?: (message: string) => void;
    allowInMemoryFallback?: boolean;
    connectFn?: typeof connect;
}
export declare function createEventBusClient(options?: CreateEventBusClientOptions): ManagedEventBus;
export declare function bootstrapStreams(options?: CreateEventBusClientOptions): Promise<void>;
//# sourceMappingURL=index.d.ts.map