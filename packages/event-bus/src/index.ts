export * from './types';

import { connect, StringCodec, type NatsConnection, type Subscription } from 'nats';

import type { BaseEvent, ManagedEventBus } from './types';

const DEFAULT_NATS_URL = 'nats://127.0.0.1:4222';

export interface CreateEventBusClientOptions {
  env?: NodeJS.ProcessEnv;
  servers?: string | string[];
  name?: string;
  timeoutMs?: number;
  maxReconnectAttempts?: number;
  logger?: (message: string) => void;
}

function normalizeServers(value: string | string[] | undefined, env?: NodeJS.ProcessEnv): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((server) => server.trim())
      .filter((server) => server.length > 0);
  }

  const fromEnv = env?.LIFEOS_NATS_URL?.trim();
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((server) => server.trim())
      .filter((server) => server.length > 0);
  }

  return [DEFAULT_NATS_URL];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class NatsEventBus implements ManagedEventBus {
  private readonly codec = StringCodec();
  private readonly servers: string[];
  private readonly name: string;
  private readonly timeoutMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly logger: ((message: string) => void) | undefined;
  private connectionPromise: Promise<NatsConnection> | null = null;
  private subscriptions = new Set<Subscription>();

  constructor(options: CreateEventBusClientOptions = {}) {
    this.servers = normalizeServers(options.servers, options.env);
    this.name = options.name ?? 'lifeos-event-bus';
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? -1;
    this.logger = options.logger;
  }

  private async getConnection(): Promise<NatsConnection> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = connect({
      servers: this.servers,
      name: this.name,
      timeout: this.timeoutMs,
      maxReconnectAttempts: this.maxReconnectAttempts,
    });

    try {
      const connection = await this.connectionPromise;
      this.logger?.(`[event-bus] connected to ${this.servers.join(', ')}`);
      return connection;
    } catch (error: unknown) {
      this.connectionPromise = null;
      throw error;
    }
  }

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    const connection = await this.getConnection();
    connection.publish(topic, this.codec.encode(JSON.stringify(event)));
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    const connection = await this.getConnection();
    const subscription = connection.subscribe(topic);
    this.subscriptions.add(subscription);

    void (async () => {
      try {
        for await (const message of subscription) {
          try {
            const decoded = this.codec.decode(message.data);
            const event = JSON.parse(decoded) as BaseEvent<T>;
            await handler(event);
          } catch (error: unknown) {
            this.logger?.(
              `[event-bus] failed to process message on topic ${topic}: ${toErrorMessage(error)}`,
            );
          }
        }
      } catch (error: unknown) {
        this.logger?.(
          `[event-bus] subscription closed with error on topic ${topic}: ${toErrorMessage(error)}`,
        );
      } finally {
        this.subscriptions.delete(subscription);
      }
    })();
  }

  async close(): Promise<void> {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.clear();

    if (!this.connectionPromise) {
      return;
    }

    try {
      const connection = await this.connectionPromise;
      await connection.drain();
      await connection.closed();
    } catch (error: unknown) {
      this.logger?.(`[event-bus] close failed: ${toErrorMessage(error)}`);
    } finally {
      this.connectionPromise = null;
    }
  }
}

export function createEventBusClient(options: CreateEventBusClientOptions = {}): ManagedEventBus {
  return new NatsEventBus(options);
}

export async function bootstrapStreams(options: CreateEventBusClientOptions = {}): Promise<void> {
  const servers = normalizeServers(options.servers, options.env);
  const connection = await connect({
    servers,
    name: options.name ?? 'lifeos-bootstrap-streams',
    timeout: options.timeoutMs ?? 2000,
    maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
  });
  await connection.drain();
  await connection.closed();
}
