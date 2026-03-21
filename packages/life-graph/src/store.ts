import { graphManager } from './manager';
import { getDefaultLifeGraphPath } from './path';
import type { GoalPlanRecord, LifeGraphDocument, LifeGraphSummary, LocalLifeGraph } from './types';

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

function toLegacyRecord(plan: LifeGraphDocument['plans'][number]): GoalPlanRecord {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    input: plan.title,
    plan: plan as unknown as Record<string, unknown>,
  };
}

export { getDefaultLifeGraphPath };

export async function loadGraph(graphPath?: string): Promise<LifeGraphDocument> {
  return graphManager.load(graphPath);
}

export async function saveGraphAtomic(graph: LifeGraphDocument, graphPath?: string): Promise<void> {
  await graphManager.save(graph, graphPath);
}

export async function appendGoalPlan<TPlan = Record<string, unknown>>(
  input: AppendGoalPlanInput<TPlan>,
  graphPath?: string,
): Promise<GoalPlanRecord<TPlan>> {
  const { record } = await graphManager.appendPlan(input, graphPath);
  return record;
}

export async function getGraphSummary(graphPath?: string): Promise<LifeGraphSummary> {
  const graph = await loadGraph(graphPath);
  const sortedPlans = [...graph.plans].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const latestPlanCreatedAt = sortedPlans[0]?.createdAt ?? null;
  const recentPlanTitles = [...graph.plans]
    .slice(-3)
    .reverse()
    .map((plan) => plan.title);

  return {
    version: graph.version,
    totalPlans: graph.plans.length,
    totalGoals: graph.plans.length,
    updatedAt: graph.updatedAt,
    latestPlanCreatedAt,
    latestGoalCreatedAt: latestPlanCreatedAt,
    recentPlanTitles,
    recentGoalTitles: recentPlanTitles,
  };
}

export async function loadLocalLifeGraph<TPlan = Record<string, unknown>>(
  graphPath?: string,
): Promise<LocalLifeGraph<TPlan>> {
  const graph = await loadGraph(graphPath);
  return {
    goals: graph.plans.map((plan) => toLegacyRecord(plan) as GoalPlanRecord<TPlan>),
  };
}

export async function appendGoalPlanRecord<TPlan = Record<string, unknown>>(
  entry: AppendGoalPlanRecordInput<TPlan>,
  graphPath?: string,
): Promise<GoalPlanRecord<TPlan>> {
  return appendGoalPlan(entry, graphPath);
}
