export { Topics } from '@lifeos/contracts';

export interface BaseEvent<T> {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  version: string;
  data: T;
  metadata?: {
    correlation_id?: string;
    trace_id?: string;
    permissions?: string[];
    [key: string]: unknown;
  };
}

export enum EventCategory {
  State = 'State',
  Command = 'Command',
  Observation = 'Observation',
}

export interface EventBus {
  publish<T>(topic: string, event: BaseEvent<T>): Promise<void>;
  subscribe<T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void>): Promise<void>;
}

export type EventBusTransport = 'nats' | 'in-memory' | 'unknown';

export type EventBusConnectionHealth = 'connected' | 'degraded' | 'disconnected';

export interface ManagedEventBus extends EventBus {
  close(): Promise<void>;
  getTransport(): EventBusTransport;
}
