import { getDefaultLifeGraphPath } from './path';
import type { GoalPlanRecord, GraphMigrationResult, LifeGraphDocument, LifeGraphStorageInfo, LifeGraphSummary, LocalLifeGraph, RunGraphMigrationsOptions } from './types';
export interface AppendGoalPlanRecordInput<TPlan = Record<string, unknown>> {
    input: string;
    plan: TPlan;
    id?: string;
    createdAt?: string;
}
export interface AppendGoalPlanInput<TPlan = Record<string, unknown>> {
    input: string;
    plan: TPlan;
    id?: string;
    createdAt?: string;
}
export { getDefaultLifeGraphPath };
export declare function runGraphMigrations(graphPath?: string, options?: RunGraphMigrationsOptions): Promise<GraphMigrationResult>;
export declare function loadGraph(graphPath?: string): Promise<LifeGraphDocument>;
export declare function saveGraphAtomic(graph: LifeGraphDocument, graphPath?: string): Promise<void>;
export declare function appendGoalPlan<TPlan = Record<string, unknown>>(input: AppendGoalPlanInput<TPlan>, graphPath?: string): Promise<GoalPlanRecord<TPlan>>;
export declare function getGraphSummary(graphPath?: string): Promise<LifeGraphSummary>;
export declare function getGraphStorageInfo(graphPath?: string): Promise<LifeGraphStorageInfo>;
export declare function loadLocalLifeGraph<TPlan = Record<string, unknown>>(graphPath?: string): Promise<LocalLifeGraph<TPlan>>;
export declare function appendGoalPlanRecord<TPlan = Record<string, unknown>>(entry: AppendGoalPlanRecordInput<TPlan>, graphPath?: string): Promise<GoalPlanRecord<TPlan>>;
