import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  LIFE_GRAPH_VERSION,
  normalizeLifeGraphDocument,
  parseVersionedLifeGraphDocument,
} from './schema';
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

function createEmptyDocument<TPlan>(now: Date = new Date()): LifeGraphDocument<TPlan> {
  return {
    version: LIFE_GRAPH_VERSION,
    updatedAt: now.toISOString(),
    goals: [],
  };
}

export function getDefaultLifeGraphPath(baseDir: string = process.cwd()): string {
  return resolve(baseDir, '.lifeos', 'life-graph.json');
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function extractGoalTitle(plan: unknown): string {
  if (plan && typeof plan === 'object' && 'title' in plan) {
    const title = (plan as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim().length > 0) {
      return title.trim();
    }
  }

  return '(untitled goal)';
}

export async function loadGraph<TPlan = Record<string, unknown>>(
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<LifeGraphDocument<TPlan>> {
  try {
    const content = await readFile(graphPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return normalizeLifeGraphDocument<TPlan>(parsed);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return createEmptyDocument<TPlan>();
    }
    if (error instanceof Error) {
      throw new Error(`Invalid life graph format at ${graphPath}: ${error.message}`);
    }
    throw new Error(`Invalid life graph format at ${graphPath}`);
  }
}

export async function saveGraphAtomic<TPlan = Record<string, unknown>>(
  graph: LifeGraphDocument<TPlan>,
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<void> {
  parseVersionedLifeGraphDocument(graph);
  await mkdir(dirname(graphPath), { recursive: true });
  const tempPath = `${graphPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  await rename(tempPath, graphPath);
}

export async function appendGoalPlan<TPlan = Record<string, unknown>>(
  input: AppendGoalPlanInput<TPlan>,
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<GoalPlanRecord<TPlan>> {
  const graph = await loadGraph<TPlan>(graphPath);
  const nowIso = new Date().toISOString();
  const record: GoalPlanRecord<TPlan> = {
    id: input.id ?? `goal_${randomUUID()}`,
    createdAt: input.createdAt ?? nowIso,
    input: input.input,
    plan: input.plan,
  };

  const nextGraph: LifeGraphDocument<TPlan> = {
    ...graph,
    updatedAt: nowIso,
    goals: [...graph.goals, record],
  };

  await saveGraphAtomic(nextGraph, graphPath);
  return record;
}

export async function getGraphSummary<TPlan = Record<string, unknown>>(
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<LifeGraphSummary> {
  const graph = await loadGraph<TPlan>(graphPath);
  const latestGoalCreatedAt =
    graph.goals.length > 0
      ? (graph.goals
          .map((goal) => goal.createdAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? null)
      : null;

  return {
    version: graph.version,
    totalGoals: graph.goals.length,
    updatedAt: graph.updatedAt,
    latestGoalCreatedAt,
    recentGoalTitles: graph.goals
      .slice(-3)
      .reverse()
      .map((goal) => extractGoalTitle(goal.plan)),
  };
}

export async function loadLocalLifeGraph<TPlan = Record<string, unknown>>(
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<LocalLifeGraph<TPlan>> {
  const graph = await loadGraph<TPlan>(graphPath);
  return { goals: graph.goals };
}

export async function appendGoalPlanRecord<TPlan = Record<string, unknown>>(
  entry: AppendGoalPlanRecordInput<TPlan>,
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<GoalPlanRecord<TPlan>> {
  return appendGoalPlan(entry, graphPath);
}
