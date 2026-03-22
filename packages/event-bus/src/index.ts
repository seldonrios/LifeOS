export * from './types';

import { connect, StringCodec, type NatsConnection, type Subscription } from 'nats';

import type { BaseEvent, EventBusTransport, ManagedEventBus } from './types';

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

type EventHandler = (event: BaseEvent<unknown>) => Promise<void>;

function matchSubject(pattern: string, subject: string): boolean {
  if (pattern === subject) {
    return true;
  }

  const patternTokens = pattern.split('.');
  const subjectTokens = subject.split('.');

  for (let index = 0; index < patternTokens.length; index += 1) {
    const token = patternTokens[index];
    if (token === '>') {
      return true;
    }

    const subjectToken = subjectTokens[index];
    if (!subjectToken) {
      return false;
    }

    if (token === '*') {
      continue;
    }

    if (token !== subjectToken) {
      return false;
    }
  }

  return patternTokens.length === subjectTokens.length;
}

class InMemoryEventBus {
  private readonly subscriptions = new Map<string, Set<EventHandler>>();

  subscribe(topic: string, handler: EventHandler): () => void {
    const existing = this.subscriptions.get(topic) ?? new Set<EventHandler>();
    existing.add(handler);
    this.subscriptions.set(topic, existing);

    return () => {
      const current = this.subscriptions.get(topic);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.subscriptions.delete(topic);
      }
    };
  }

  async publish(topic: string, event: BaseEvent<unknown>): Promise<void> {
    const matchingHandlers: EventHandler[] = [];
    this.subscriptions.forEach((handlers, pattern) => {
      if (!matchSubject(pattern, topic)) {
        return;
      }
      handlers.forEach((handler) => matchingHandlers.push(handler));
    });

    for (const handler of matchingHandlers) {
      await handler(event);
    }
  }
}

const sharedInMemoryBus = new InMemoryEventBus();

class LifeOSEventBus implements ManagedEventBus {
  private readonly codec = StringCodec();
  private readonly servers: string[];
  private readonly name: string;
  private readonly timeoutMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly logger: ((message: string) => void) | undefined;
  private connectionPromise: Promise<NatsConnection | null> | null = null;
  private connection: NatsConnection | null = null;
  private subscriptions = new Set<Subscription>();
  private readonly fallbackUnsubscribers = new Set<() => void>();
  private fallbackWarningShown = false;
  private transport: EventBusTransport = 'unknown';

  constructor(options: CreateEventBusClientOptions = {}) {
    this.servers = normalizeServers(options.servers, options.env);
    this.name = options.name ?? 'lifeos-event-bus';
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? -1;
    this.logger = options.logger;
  }

  private logFallback(reason: unknown): void {
    if (this.fallbackWarningShown) {
      return;
    }
    this.fallbackWarningShown = true;
    this.transport = 'in-memory';
    this.logger?.(
      `[event-bus] NATS unavailable, using in-memory fallback (${toErrorMessage(reason)})`,
    );
  }

  private async getConnection(): Promise<NatsConnection | null> {
    if (this.connection) {
      return this.connection;
    }

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
      this.connection = connection;
      this.transport = 'nats';
      this.logger?.(`[event-bus] connected to ${this.servers.join(', ')}`);
      return connection;
    } catch (error: unknown) {
      this.logFallback(error);
      this.connectionPromise = null;
      return null;
    }
  }

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    const connection = await this.getConnection();
    if (connection) {
      connection.publish(topic, this.codec.encode(JSON.stringify(event)));
      return;
    }

    await sharedInMemoryBus.publish(topic, event as BaseEvent<unknown>);
    this.transport = 'in-memory';
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    const connection = await this.getConnection();
    if (!connection) {
      const unsubscribe = sharedInMemoryBus.subscribe(topic, async (event: BaseEvent<unknown>) => {
        await handler(event as BaseEvent<T>);
      });
      this.fallbackUnsubscribers.add(unsubscribe);
      this.transport = 'in-memory';
      return;
    }

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
    this.fallbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.fallbackUnsubscribers.clear();

    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions.clear();

    if (!this.connectionPromise || !this.connection) {
      return;
    }

    try {
      const connection = this.connection;
      await connection.drain();
      await connection.closed();
    } catch (error: unknown) {
      this.logger?.(`[event-bus] close failed: ${toErrorMessage(error)}`);
    } finally {
      this.connection = null;
      this.connectionPromise = null;
      if (this.transport !== 'in-memory') {
        this.transport = 'unknown';
      }
    }
  }

  getTransport(): EventBusTransport {
    return this.transport;
  }
}

export function createEventBusClient(options: CreateEventBusClientOptions = {}): ManagedEventBus {
  return new LifeOSEventBus(options);
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
