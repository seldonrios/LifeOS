import { type LifeGraphPathOptions } from './path';
import type { GoalPlanRecord, LifeGraphDocument, LifeGraphStorageInfo } from './types';
export type LifeGraphManagerOptions = LifeGraphPathOptions;
export interface AppendPlanInput<TPlan = Record<string, unknown>> {
    input: string;
    plan: TPlan;
    id?: string;
    createdAt?: string;
}
export declare class LifeGraphManager {
    private readonly options;
    private readonly dbByPath;
    private readonly initializationByPath;
    constructor(options?: LifeGraphManagerOptions);
    private resolvePath;
    private getDb;
    private initializeSchema;
    private writeGraphToDb;
    private readGraphFromDb;
    private migrateFromJsonIfNeeded;
    private getContext;
    load(graphPath?: string): Promise<LifeGraphDocument>;
    save(graph: LifeGraphDocument, graphPath?: string): Promise<void>;
    getStorageInfo(graphPath?: string): Promise<LifeGraphStorageInfo>;
    appendPlan<TPlan = Record<string, unknown>>(input: AppendPlanInput<TPlan>, graphPath?: string): Promise<{
        record: GoalPlanRecord<TPlan>;
        graph: LifeGraphDocument;
    }>;
}
export declare const graphManager: LifeGraphManager;
