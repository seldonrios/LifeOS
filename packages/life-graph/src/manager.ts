import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  GoalPlanSchema,
  LegacyLocalLifeGraphSchema,
  LegacyVersionedLifeGraphDocumentSchema,
  LIFE_GRAPH_VERSION,
  LifeGraphDocumentSchema,
  type ParsedGoalPlan,
} from './schema';
import { resolveLifeGraphPath, type LifeGraphPathOptions } from './path';
import type {
  GoalPlan,
  GoalPlanRecord,
  GoalPlanSource,
  LifeGraphDocument,
  LifeGraphTask,
} from './types';

export type LifeGraphManagerOptions = LifeGraphPathOptions;

export interface AppendPlanInput<TPlan = Record<string, unknown>> {
  input: string;
  plan: TPlan;
  id?: string;
  createdAt?: string;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function stripUtf8Bom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function createEmptyDocument(now: Date = new Date()): LifeGraphDocument {
  return {
    version: LIFE_GRAPH_VERSION,
    plans: [],
    updatedAt: now.toISOString(),
  };
}

function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTaskStatus(value: unknown): LifeGraphTask['status'] {
  if (value === 'todo' || value === 'in-progress' || value === 'done') {
    return value;
  }

  return 'todo';
}

function toTaskPriority(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.trunc(value);
    if (rounded >= 1 && rounded <= 5) {
      return rounded;
    }
  }

  return 3;
}

function toDateOnlyOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTaskArray(plan: GoalPlanSource): LifeGraphTask[] {
  const fromTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const fromSubtasks = Array.isArray(plan.subtasks) ? plan.subtasks : [];
  const taskCandidates = fromTasks.length > 0 ? fromTasks : fromSubtasks;

  return taskCandidates.map((candidate, index) => {
    const taskData = isPlainObject(candidate) ? candidate : {};
    const taskTitle =
      sanitizeString(taskData.title) ?? sanitizeString(taskData.description) ?? `Task ${index + 1}`;
    const dueDate = toDateOnlyOrUndefined(taskData.dueDate);

    const normalizedTask: LifeGraphTask = {
      id: sanitizeString(taskData.id) ?? `task_${randomUUID()}`,
      title: taskTitle,
      status: toTaskStatus(taskData.status),
      priority: toTaskPriority(taskData.priority),
    };

    if (dueDate) {
      normalizedTask.dueDate = dueDate;
    }

    return normalizedTask;
  });
}

function toGoalPlan(source: {
  input: string;
  plan: unknown;
  fallbackId: string;
  fallbackCreatedAt: string;
}): GoalPlan {
  const plan = isPlainObject(source.plan) ? (source.plan as GoalPlanSource) : {};
  const candidate: ParsedGoalPlan = {
    id: sanitizeString(plan.id) ?? source.fallbackId,
    title: sanitizeString(plan.title) ?? source.input,
    description: sanitizeString(plan.description) ?? source.input,
    deadline: toDateOnlyOrUndefined(plan.deadline) ?? null,
    tasks: normalizeTaskArray(plan),
    createdAt: sanitizeString(plan.createdAt) ?? source.fallbackCreatedAt,
  };

  return GoalPlanSchema.parse(candidate) as GoalPlan;
}

function migrateLegacyGoals(
  legacyGoals: Array<{ id: string; createdAt: string; input: string; plan?: unknown }>,
): GoalPlan[] {
  return legacyGoals.map((legacy) =>
    toGoalPlan({
      input: legacy.input,
      plan: legacy.plan ?? {},
      fallbackId: legacy.id || `goal_${randomUUID()}`,
      fallbackCreatedAt: legacy.createdAt,
    }),
  );
}

function normalizeDocument(value: unknown, now: Date): LifeGraphDocument {
  const versionedPlans = LifeGraphDocumentSchema.safeParse(value);
  if (versionedPlans.success) {
    return versionedPlans.data as LifeGraphDocument;
  }

  const versionedGoals = LegacyVersionedLifeGraphDocumentSchema.safeParse(value);
  if (versionedGoals.success) {
    return {
      version: LIFE_GRAPH_VERSION,
      updatedAt: versionedGoals.data.updatedAt,
      plans: migrateLegacyGoals(versionedGoals.data.goals),
    };
  }

  const legacyGoals = LegacyLocalLifeGraphSchema.safeParse(value);
  if (legacyGoals.success) {
    return {
      version: LIFE_GRAPH_VERSION,
      updatedAt: now.toISOString(),
      plans: migrateLegacyGoals(legacyGoals.data.goals),
    };
  }

  return LifeGraphDocumentSchema.parse(value) as LifeGraphDocument;
}

export class LifeGraphManager {
  constructor(private readonly options: LifeGraphManagerOptions = {}) {}

  private resolvePath(graphPath?: string): string {
    return resolveLifeGraphPath(graphPath, this.options);
  }

  async load(graphPath?: string): Promise<LifeGraphDocument> {
    const resolvedPath = this.resolvePath(graphPath);

    try {
      const content = await readFile(resolvedPath, 'utf8');
      const parsed = JSON.parse(stripUtf8Bom(content)) as unknown;
      return normalizeDocument(parsed, new Date());
    } catch (error: unknown) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return createEmptyDocument();
      }

      if (error instanceof Error) {
        throw new Error(`Invalid life graph format at ${resolvedPath}: ${error.message}`);
      }

      throw new Error(`Invalid life graph format at ${resolvedPath}`);
    }
  }

  async save(graph: LifeGraphDocument, graphPath?: string): Promise<void> {
    const resolvedPath = this.resolvePath(graphPath);
    const parsed = LifeGraphDocumentSchema.parse(graph) as LifeGraphDocument;

    await mkdir(dirname(resolvedPath), { recursive: true });
    const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    await rename(tempPath, resolvedPath);
  }

  async appendPlan<TPlan = Record<string, unknown>>(
    input: AppendPlanInput<TPlan>,
    graphPath?: string,
  ): Promise<{ record: GoalPlanRecord<TPlan>; graph: LifeGraphDocument }> {
    const nowIso = new Date().toISOString();
    const graph = await this.load(graphPath);
    const normalizedPlan = toGoalPlan({
      input: input.input,
      plan: input.plan,
      fallbackId: input.id ?? `goal_${randomUUID()}`,
      fallbackCreatedAt: input.createdAt ?? nowIso,
    });

    const nextGraph: LifeGraphDocument = {
      ...graph,
      updatedAt: nowIso,
      plans: [...graph.plans, normalizedPlan],
    };

    await this.save(nextGraph, graphPath);

    return {
      record: {
        id: normalizedPlan.id,
        createdAt: normalizedPlan.createdAt,
        input: input.input,
        plan: input.plan,
      },
      graph: nextGraph,
    };
  }
}

export const graphManager = new LifeGraphManager();
