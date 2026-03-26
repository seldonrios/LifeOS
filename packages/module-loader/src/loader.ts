import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

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
import { readLifeOSManifestFile, type LifeOSModuleManifest } from './manifest';
import { checkPermissions } from './permissions';

const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const WRITE_METHOD_PATTERN = /^(save|set|update|delete|remove|merge|apply|register)/i;
const EVENT_SECURITY_POLICY_DENIED = 'lifeos.security.policy.denied';

type RuntimePermissionMode = 'off' | 'warn' | 'strict';

interface RuntimePermissionPolicy {
  moduleId: string;
  graph: {
    read: boolean;
    append: boolean;
    write: boolean;
  };
  eventPermissions: {
    subscribe: string[];
    publish: string[];
  };
}

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
  baseDir?: string;
  graphPath?: string;
  requireManifest?: boolean;
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

function parseEventPermission(
  permission: string,
): { action: 'subscribe' | 'publish'; topic: string } | null {
  const [action, topic] = permission.split(':', 2);
  if (!action || !topic || (action !== 'subscribe' && action !== 'publish')) {
    return null;
  }
  return {
    action,
    topic,
  };
}

function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) {
    return true;
  }

  const patternParts = pattern.split('.');
  const topicParts = topic.split('.');

  for (let index = 0; index < patternParts.length; index += 1) {
    const token = patternParts[index];
    if (token === '>') {
      return true;
    }
    const part = topicParts[index];
    if (!part) {
      return false;
    }
    if (token !== '*' && token !== part) {
      return false;
    }
  }
  return patternParts.length === topicParts.length;
}

function resolveRuntimePermissionMode(env: NodeJS.ProcessEnv): RuntimePermissionMode {
  const raw = (env.LIFEOS_MODULE_RUNTIME_PERMISSIONS ?? 'strict').trim().toLowerCase();
  if (raw === 'off' || raw === 'disabled' || raw === 'false' || raw === '0') {
    return 'off';
  }
  if (raw === 'warn') {
    return 'warn';
  }
  if (raw === 'strict' || raw === 'enforce' || raw === 'true' || raw === '1' || raw.length === 0) {
    return 'strict';
  }
  return 'strict';
}

export class ModuleLoader {
  private readonly modules = new Map<string, LifeOSModule>();
  private readonly moduleContexts = new Map<string, ModuleRuntimeContext>();
  private readonly env: NodeJS.ProcessEnv;
  private readonly baseDir: string;
  private readonly graphPath: string | undefined;
  private readonly requireManifest: boolean;
  private readonly runtimePermissionMode: RuntimePermissionMode;
  private readonly eventBus: ManagedEventBus;
  private readonly createGraphClient: typeof createLifeGraphClient;
  private readonly logger: (message: string) => void;

  constructor(options: CreateModuleLoaderOptions = {}) {
    this.env = options.env ?? process.env;
    this.baseDir = options.baseDir ?? process.cwd();
    this.graphPath = options.graphPath;
    const legacyManifestBypass =
      (this.env.LIFEOS_ALLOW_LEGACY_MANIFESTLESS ?? '').trim().toLowerCase() === 'true';
    this.requireManifest =
      options.requireManifest ??
      (!legacyManifestBypass &&
        (this.env.LIFEOS_MODULE_MANIFEST_REQUIRED ?? 'true').trim().toLowerCase() !== 'false');
    this.runtimePermissionMode = resolveRuntimePermissionMode(this.env);
    this.createGraphClient = options.createLifeGraphClient ?? createLifeGraphClient;
    this.logger = options.logger ?? ((line: string) => console.log(line));
    this.eventBus =
      options.eventBus ??
      createEventBusClient({
        env: this.env,
        name: 'lifeos-module-loader',
        ...(options.eventBusOptions ?? {}),
      });

    if (legacyManifestBypass) {
      this.logger(
        '[ModuleLoader] legacy manifest bypass enabled; this compatibility mode is deprecated and should be removed after manifest migration.',
      );
    }
  }

  private emitPolicyDenied(moduleId: string, action: string, detail: string): void {
    const event = createEventEnvelope(
      EVENT_SECURITY_POLICY_DENIED,
      {
        moduleId,
        action,
        detail,
        runtimeMode: this.runtimePermissionMode,
      },
      'module-loader',
    );

    void this.eventBus.publish(EVENT_SECURITY_POLICY_DENIED, event).catch(() => {
      return;
    });
  }

  private buildRuntimePolicy(
    moduleId: string,
    manifest: LifeOSModuleManifest,
  ): RuntimePermissionPolicy {
    const subscribe: string[] = [];
    const publish: string[] = [];
    for (const permission of manifest.permissions.events) {
      const parsed = parseEventPermission(permission);
      if (!parsed) {
        continue;
      }
      if (parsed.action === 'subscribe') {
        subscribe.push(parsed.topic);
      } else {
        publish.push(parsed.topic);
      }
    }

    return {
      moduleId,
      graph: {
        read:
          manifest.permissions.graph.includes('read') ||
          manifest.permissions.graph.includes('write'),
        append:
          manifest.permissions.graph.includes('append') ||
          manifest.permissions.graph.includes('write'),
        write: manifest.permissions.graph.includes('write'),
      },
      eventPermissions: {
        subscribe,
        publish,
      },
    };
  }

  private authorizeRuntimeAction(
    moduleId: string,
    action: string,
    detail: string,
    allowed: boolean,
  ): boolean {
    if (allowed || this.runtimePermissionMode === 'off') {
      return true;
    }

    const message = `[ModuleLoader] ${moduleId} unauthorized ${action}: ${detail}`;
    this.emitPolicyDenied(moduleId, action, detail);
    if (this.runtimePermissionMode === 'strict') {
      throw new Error(message);
    }

    this.logger(`${message} (allowed in warn mode)`);
    return true;
  }

  private wrapGraphClientWithPolicy(
    moduleId: string,
    client: LifeGraphClient,
    policy: RuntimePermissionPolicy,
  ): LifeGraphClient {
    if (policy.graph.write) {
      return client;
    }

    return new Proxy(client, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') {
          return value;
        }

        const methodName = String(property);
        return (...args: unknown[]) => {
          const requiresWrite =
            WRITE_METHOD_PATTERN.test(methodName) ||
            methodName === 'createRelationship' ||
            methodName === 'saveGraph' ||
            methodName === 'mergeDelta' ||
            methodName === 'applyUpdates';
          const requiresAppend =
            methodName.startsWith('append') ||
            methodName === 'createNode' ||
            methodName === 'createRelationship';

          if (requiresWrite) {
            this.authorizeRuntimeAction(
              moduleId,
              'graph.write',
              `method "${methodName}" requires graph.write`,
              policy.graph.write,
            );
          } else if (requiresAppend) {
            this.authorizeRuntimeAction(
              moduleId,
              'graph.append',
              `method "${methodName}" requires graph.append or graph.write`,
              policy.graph.append || policy.graph.write,
            );
          }

          return Reflect.apply(value as (...input: unknown[]) => unknown, target, args);
        };
      },
    });
  }

  private createContext(policy?: RuntimePermissionPolicy): ModuleRuntimeContext {
    const context: ModuleRuntimeContext = {
      env: this.env,
      eventBus: this.eventBus,
      createLifeGraphClient: (options?: CreateLifeGraphClientOptions): LifeGraphClient => {
        const resolved = this.createGraphClient(options);
        if (!policy) {
          return resolved;
        }
        this.authorizeRuntimeAction(
          policy.moduleId,
          'graph.read',
          'createLifeGraphClient requested graph access without graph permissions',
          policy.graph.read || policy.graph.append || policy.graph.write,
        );
        return this.wrapGraphClientWithPolicy(policy.moduleId, resolved, policy);
      },
      subscribe: async <T>(
        topic: string,
        handler: (event: BaseEvent<T>) => Promise<void> | void,
      ): Promise<void> => {
        try {
          if (policy) {
            const allowed = policy.eventPermissions.subscribe.some((pattern) =>
              topicMatches(pattern, topic),
            );
            this.authorizeRuntimeAction(
              policy.moduleId,
              'event.subscribe',
              `topic "${topic}" is not declared in lifeos.json`,
              allowed,
            );
          }
          await this.eventBus.subscribe(topic, async (event: BaseEvent<T>) => {
            await handler(event);
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger(`[ModuleLoader] subscribe degraded for topic "${topic}": ${message}`);
          if (this.runtimePermissionMode === 'strict') {
            throw error;
          }
        }
      },
      publish: async <T extends Record<string, unknown>>(
        topic: string,
        data: T,
        source = 'lifeos-module-loader',
      ): Promise<BaseEvent<T>> => {
        const event = createEventEnvelope(topic, data, source);
        try {
          if (policy) {
            const allowed = policy.eventPermissions.publish.some((pattern) => pattern === topic);
            this.authorizeRuntimeAction(
              policy.moduleId,
              'event.publish',
              `topic "${topic}" is not declared in lifeos.json`,
              allowed,
            );
          }
          await this.eventBus.publish(topic, event);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger(`[ModuleLoader] publish degraded for topic "${topic}": ${message}`);
          if (this.runtimePermissionMode === 'strict') {
            throw error;
          }
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

    if (!MODULE_ID_PATTERN.test(module.id)) {
      throw new Error(
        `Module id "${module.id}" is invalid. Use lowercase kebab-case with 2-63 characters.`,
      );
    }

    const manifestPath = resolve(this.baseDir, 'modules', module.id, 'lifeos.json');
    let runtimePolicy: RuntimePermissionPolicy | undefined;
    try {
      await access(manifestPath);
      const manifestResult = await readLifeOSManifestFile(manifestPath);
      if (!manifestResult.valid || !manifestResult.manifest) {
        throw new Error(
          `Module ${module.id} has invalid lifeos.json: ${manifestResult.errors.join('; ')}`,
        );
      }
      if (manifestResult.manifest.name !== module.id) {
        throw new Error(
          `Module ${module.id} manifest name mismatch: expected "${module.id}", got "${manifestResult.manifest.name}"`,
        );
      }
      const permissionResult = await checkPermissions(manifestResult.manifest.permissions, {
        moduleId: module.id,
        env: this.env,
      });
      if (!permissionResult.allowed) {
        throw new Error(
          `Module ${module.id} requested unauthorized permissions${permissionResult.reason ? `: ${permissionResult.reason}` : ''}`,
        );
      }
      runtimePolicy = this.buildRuntimePolicy(module.id, manifestResult.manifest);
      this.logger(`[ModuleLoader] ${module.id} permissions approved`);
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        if (this.requireManifest) {
          throw new Error(`Module ${module.id} missing required lifeos.json at ${manifestPath}.`);
        }
        this.logger(
          `[ModuleLoader] ${module.id} has no lifeos.json manifest; skipping policy check`,
        );
      } else {
        throw error;
      }
    }

    const context = this.createContext(runtimePolicy);
    await module.init(context);
    this.modules.set(module.id, module);
    this.moduleContexts.set(module.id, context);
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
    const modules = Array.from(this.modules.values()).reverse();
    for (const module of modules) {
      if (!module.dispose) {
        continue;
      }
      try {
        const context = this.moduleContexts.get(module.id) ?? this.createContext();
        await module.dispose(context);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger(`[ModuleLoader] ${module.id} dispose failed: ${message}`);
      }
    }

    this.modules.clear();
    this.moduleContexts.clear();
    await this.eventBus.close();
  }
}

export function createModuleLoader(options: CreateModuleLoaderOptions = {}): ModuleLoader {
  return new ModuleLoader(options);
}

export const moduleLoader = createModuleLoader();
