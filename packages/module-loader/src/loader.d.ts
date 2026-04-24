import { type BaseEvent, type CreateEventBusClientOptions, type ManagedEventBus } from '@lifeos/event-bus';
import { createLifeGraphClient, type CreateLifeGraphClientOptions, type LifeGraphClient } from '@lifeos/life-graph';
interface HeapPressureSnapshot {
    heapUsed: number;
    heapLimit: number;
}
export interface RestrictedEventBus {
    subscribe<T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void> | void): Promise<void>;
    publish<T>(topic: string, event: BaseEvent<T>): Promise<void>;
}
export interface ModuleRuntimeContext {
    env: NodeJS.ProcessEnv;
    graphPath?: string;
    eventBus: RestrictedEventBus;
    createLifeGraphClient: (options?: CreateLifeGraphClientOptions) => LifeGraphClient;
    subscribe<T>(topic: string, handler: (event: BaseEvent<T>) => Promise<void> | void): Promise<void>;
    publish<T extends Record<string, unknown>>(topic: string, data: T, source?: string): Promise<BaseEvent<T>>;
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
    heapUsageProvider?: () => HeapPressureSnapshot;
    logger?: (message: string) => void;
}
export declare class ModuleLoader {
    private readonly modules;
    private readonly moduleContexts;
    private readonly env;
    private readonly baseDir;
    private readonly graphPath;
    private readonly requireManifest;
    private readonly runtimePermissionMode;
    private readonly resourceEnforcementMode;
    private readonly eventBus;
    private readonly createGraphClient;
    private readonly heapUsageProvider;
    private readonly logger;
    private readonly prevalidatedModules;
    constructor(options?: CreateModuleLoaderOptions);
    private logStructured;
    private suggestedFixForStage;
    private parseRequiredPackageName;
    private detectDependencyCycles;
    preStart(modules: LifeOSModule[]): Promise<void>;
    private emitPolicyDenied;
    private emitResourceEnforcement;
    private enforceResourceBudget;
    private buildRuntimePolicy;
    private authorizeRuntimeAction;
    private wrapGraphClientWithPolicy;
    private createContext;
    load(module: LifeOSModule): Promise<void>;
    loadMany(modules: LifeOSModule[]): Promise<void>;
    getAll(): LifeOSModule[];
    getModuleIds(): string[];
    has(moduleId: string): boolean;
    publish<T extends Record<string, unknown>>(topic: string, data: T, source?: string): Promise<BaseEvent<T>>;
    close(): Promise<void>;
}
export declare function createModuleLoader(options?: CreateModuleLoaderOptions): ModuleLoader;
export declare const moduleLoader: ModuleLoader;
export {};
