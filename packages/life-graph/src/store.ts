import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { GoalPlanRecord, LocalLifeGraph } from './types';

export interface AppendGoalPlanRecordInput<TPlan = Record<string, unknown>> {
  input: string;
  plan: TPlan;
  id?: string;
  createdAt?: string;
}

function emptyGraph<TPlan>(): LocalLifeGraph<TPlan> {
  return { goals: [] };
}

function validateGraphShape(value: unknown): value is LocalLifeGraph {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeGraph = value as LocalLifeGraph;
  return Array.isArray(maybeGraph.goals);
}

export function getDefaultLifeGraphPath(baseDir: string = process.cwd()): string {
  return resolve(baseDir, '.lifeos', 'life-graph.json');
}

export async function loadLocalLifeGraph<TPlan = Record<string, unknown>>(
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<LocalLifeGraph<TPlan>> {
  try {
    const content = await readFile(graphPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!validateGraphShape(parsed)) {
      throw new Error(`Invalid life graph format at ${graphPath}`);
    }
    return parsed as LocalLifeGraph<TPlan>;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return emptyGraph<TPlan>();
    }
    throw error;
  }
}

async function writeGraphAtomically<TPlan>(
  graphPath: string,
  graph: LocalLifeGraph<TPlan>,
): Promise<void> {
  await mkdir(dirname(graphPath), { recursive: true });
  const tempPath = `${graphPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  await rename(tempPath, graphPath);
}

export async function appendGoalPlanRecord<TPlan = Record<string, unknown>>(
  entry: AppendGoalPlanRecordInput<TPlan>,
  graphPath: string = getDefaultLifeGraphPath(),
): Promise<GoalPlanRecord<TPlan>> {
  const graph = await loadLocalLifeGraph<TPlan>(graphPath);
  const record: GoalPlanRecord<TPlan> = {
    id: entry.id ?? `goal_${randomUUID()}`,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    input: entry.input,
    plan: entry.plan,
  };

  const nextGraph: LocalLifeGraph<TPlan> = {
    ...graph,
    goals: [...graph.goals, record],
  };

  await writeGraphAtomically(graphPath, nextGraph);
  return record;
}
