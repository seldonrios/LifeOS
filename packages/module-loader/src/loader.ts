import { randomUUID } from 'node:crypto';

import {
  createEventBusClient,
  type BaseEvent,
  type CreateEventBusClientOptions,
  type ManagedEventBus,
} from '@lifeos/event-bus';
import {
  createLifeGraphClient,
  type CreateLifeGraphClientOptions,
  type LifeGraphClient,
} from '@lifeos/life-graph';

export interface ModuleRuntimeContext {
  env: NodeJS.ProcessEnv;
  graphPath?: string;
  eventBus: ManagedEventBus;
  createLifeGraphClient: (options?: CreateLifeGraphClientOptions) => LifeGraphClient;
  subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void> | void,
  ): Promise<void>;
  publish<T extends Record<string, unknown>>(
    topic: string,
    data: T,
    source?: string,
  ): Promise<BaseEvent<T>>;
  log: (message: string) => void;
}

export interface LifeOSModule {
  id: string;
  init: (context: ModuleRuntimeContext) => Promise<void> | void;
  dispose?: (context: ModuleRuntimeContext) => Promise<void> | void;
}

export interface CreateModuleLoaderOptions {
  env?: NodeJS.ProcessEnv;
  graphPath?: string;
  eventBus?: ManagedEventBus;
  eventBusOptions?: CreateEventBusClientOptions;
  createLifeGraphClient?: typeof createLifeGraphClient;
  logger?: (message: string) => void;
}

function createEventEnvelope<T extends Record<string, unknown>>(
  topic: string,
  data: T,
  source: string,
): BaseEvent<T> {
  return {
    id: randomUUID(),
    type: topic,
    timestamp: new Date().toISOString(),
    source,
    version: '0.1.0',
    data,
  };
}

export class ModuleLoader {
  private readonly modules = new Map<string, LifeOSModule>();
  private readonly env: NodeJS.ProcessEnv;
  private readonly graphPath: string | undefined;
  private readonly eventBus: ManagedEventBus;
  private readonly createGraphClient: typeof createLifeGraphClient;
  private readonly logger: (message: string) => void;

  constructor(options: CreateModuleLoaderOptions = {}) {
    this.env = options.env ?? process.env;
    this.graphPath = options.graphPath;
    this.createGraphClient = options.createLifeGraphClient ?? createLifeGraphClient;
    this.logger = options.logger ?? ((line: string) => console.log(line));
    this.eventBus =
      options.eventBus ??
      createEventBusClient({
        env: this.env,
        name: 'lifeos-module-loader',
        ...(options.eventBusOptions ?? {}),
      });
  }

  private createContext(): ModuleRuntimeContext {
    const context: ModuleRuntimeContext = {
      env: this.env,
      eventBus: this.eventBus,
      createLifeGraphClient: this.createGraphClient,
      subscribe: async <T>(
        topic: string,
        handler: (event: BaseEvent<T>) => Promise<void> | void,
      ): Promise<void> => {
        try {
          await this.eventBus.subscribe(topic, async (event: BaseEvent<T>) => {
            await handler(event);
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger(`[ModuleLoader] subscribe degraded for topic "${topic}": ${message}`);
        }
      },
      publish: async <T extends Record<string, unknown>>(
        topic: string,
        data: T,
        source = 'lifeos-module-loader',
      ): Promise<BaseEvent<T>> => {
        const event = createEventEnvelope(topic, data, source);
        try {
          await this.eventBus.publish(topic, event);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger(`[ModuleLoader] publish degraded for topic "${topic}": ${message}`);
        }
        return event;
      },
      log: this.logger,
    };

    if (this.graphPath) {
      context.graphPath = this.graphPath;
    }

    return context;
  }

  async load(module: LifeOSModule): Promise<void> {
    if (this.modules.has(module.id)) {
      return;
    }

    const context = this.createContext();
    await module.init(context);
    this.modules.set(module.id, module);
    this.logger(`[ModuleLoader] ${module.id} loaded`);
  }

  async loadMany(modules: LifeOSModule[]): Promise<void> {
    for (const module of modules) {
      await this.load(module);
    }
  }

  getAll(): LifeOSModule[] {
    return Array.from(this.modules.values());
  }

  getModuleIds(): string[] {
    return Array.from(this.modules.keys());
  }

  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  async publish<T extends Record<string, unknown>>(
    topic: string,
    data: T,
    source?: string,
  ): Promise<BaseEvent<T>> {
    return this.createContext().publish(topic, data, source);
  }

  async close(): Promise<void> {
    const context = this.createContext();
    const modules = Array.from(this.modules.values()).reverse();
    for (const module of modules) {
      if (!module.dispose) {
        continue;
      }
      try {
        await module.dispose(context);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger(`[ModuleLoader] ${module.id} dispose failed: ${message}`);
      }
    }

    this.modules.clear();
    await this.eventBus.close();
  }
}

export function createModuleLoader(options: CreateModuleLoaderOptions = {}): ModuleLoader {
  return new ModuleLoader(options);
}

export const moduleLoader = createModuleLoader();
