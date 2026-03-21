import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { LifeGraphManager, type LifeGraphManagerOptions } from './manager';
import { resolveLifeGraphPath } from './path';
import type { GoalPlan, LifeGraphClient, LifeGraphTask, ModuleSchema } from './types';

export class UnsupportedQueryError extends Error {
  constructor(public readonly query: string) {
    super(`Unsupported life graph query for MVP client: ${query}`);
    this.name = 'UnsupportedQueryError';
  }
}

export class UnsupportedLabelError extends Error {
  constructor(public readonly label: string) {
    super(`Unsupported node label for MVP client: ${label}`);
    this.name = 'UnsupportedLabelError';
  }
}

export class UnsupportedOperationError extends Error {
  constructor(operation: string) {
    super(`Unsupported operation for file-backed MVP life graph client: ${operation}`);
    this.name = 'UnsupportedOperationError';
  }
}

export interface CreateLifeGraphClientOptions extends LifeGraphManagerOptions {
  graphPath?: string;
}

interface ModuleSchemaDocument {
  schemas: ModuleSchema[];
}

type QueryParams = Record<string, unknown> | undefined;

interface TaskNode extends LifeGraphTask {
  planId: string;
}

interface PlanCreateInput {
  title: string;
  description: string;
  deadline?: string | null;
  tasks?: unknown[];
  id?: string;
  createdAt?: string;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return getString(value);
}

function getOptionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function parseLimit(params: QueryParams): number | null {
  const limit = getOptionalNumber(params?.limit);
  if (limit === null) {
    return null;
  }

  const normalized = Math.trunc(limit);
  if (normalized <= 0) {
    return null;
  }

  return normalized;
}

function parsePlanId(params: QueryParams): string | null {
  return getString(params?.planId);
}

function normalizeQuery(query: string): string {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new UnsupportedQueryError(query);
  }

  return normalized;
}

function toTaskNode(plan: GoalPlan): TaskNode[] {
  return plan.tasks.map((task) => ({
    ...task,
    planId: plan.id,
  }));
}

function applyLimit<T>(items: T[], limit: number | null): T[] {
  if (limit === null) {
    return items;
  }

  return items.slice(-limit);
}

function toPlanCreateInput(data: Record<string, unknown>): PlanCreateInput {
  const title = getString(data.title);
  const description = getString(data.description);

  if (!title) {
    throw new Error('createNode(plan): "title" is required.');
  }
  if (!description) {
    throw new Error('createNode(plan): "description" is required.');
  }

  const rawTasks = data.tasks;
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];

  const input: PlanCreateInput = {
    title,
    description,
    deadline: getNullableString(data.deadline),
    tasks,
  };

  const id = getString(data.id);
  if (id) {
    input.id = id;
  }

  const createdAt = getString(data.createdAt);
  if (createdAt) {
    input.createdAt = createdAt;
  }

  return input;
}

function normalizeLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new UnsupportedLabelError(label);
  }

  return normalized;
}

async function readModuleSchemaDocument(sidecarPath: string): Promise<ModuleSchemaDocument> {
  try {
    const content = await readFile(sidecarPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'schemas' in parsed &&
      Array.isArray((parsed as { schemas?: unknown }).schemas)
    ) {
      return { schemas: (parsed as { schemas: ModuleSchema[] }).schemas };
    }

    return { schemas: [] };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { schemas: [] };
    }

    throw error;
  }
}

async function writeModuleSchemaDocument(
  sidecarPath: string,
  document: ModuleSchemaDocument,
): Promise<void> {
  await mkdir(dirname(sidecarPath), { recursive: true });
  const tempPath = `${sidecarPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(tempPath, sidecarPath);
}

export function createLifeGraphClient(options: CreateLifeGraphClientOptions = {}): LifeGraphClient {
  const manager = new LifeGraphManager(options);
  const resolvedGraphPath = resolveLifeGraphPath(options.graphPath, options);
  const moduleSchemaPath = join(dirname(resolvedGraphPath), 'module-schemas.json');

  return {
    async query<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]> {
      const normalizedQuery = normalizeQuery(query);
      const graph = await manager.load(resolvedGraphPath);

      if (normalizedQuery === 'plans') {
        const limit = parseLimit(params);
        return applyLimit([...graph.plans], limit) as T[];
      }

      if (normalizedQuery === 'tasks') {
        const planId = parsePlanId(params);
        const plans = planId ? graph.plans.filter((plan) => plan.id === planId) : graph.plans;
        const tasks = plans.flatMap((plan) => toTaskNode(plan));
        const limit = parseLimit(params);
        return applyLimit(tasks, limit) as T[];
      }

      throw new UnsupportedQueryError(query);
    },

    async getNode<T = unknown>(id: string): Promise<T | null> {
      const nodeId = id.trim();
      if (!nodeId) {
        return null;
      }

      const graph = await manager.load(resolvedGraphPath);
      const plan = graph.plans.find((candidate) => candidate.id === nodeId);
      if (plan) {
        return plan as T;
      }

      for (const candidatePlan of graph.plans) {
        const task = candidatePlan.tasks.find((candidateTask) => candidateTask.id === nodeId);
        if (task) {
          return {
            ...task,
            planId: candidatePlan.id,
          } as T;
        }
      }

      return null;
    },

    async createNode<T extends Record<string, unknown>>(label: string, data: T): Promise<string> {
      const normalizedLabel = normalizeLabel(label);
      if (normalizedLabel !== 'plan') {
        throw new UnsupportedLabelError(label);
      }

      const input = toPlanCreateInput(data);
      const appendInput: {
        input: string;
        plan: {
          title: string;
          description: string;
          deadline: string | null;
          tasks: unknown[];
        };
        id?: string;
        createdAt?: string;
      } = {
        input: input.title,
        plan: {
          title: input.title,
          description: input.description,
          deadline: input.deadline ?? null,
          tasks: input.tasks ?? [],
        },
      };

      if (input.id) {
        appendInput.id = input.id;
      }
      if (input.createdAt) {
        appendInput.createdAt = input.createdAt;
      }

      const { record } = await manager.appendPlan(appendInput, resolvedGraphPath);

      return record.id;
    },

    async createRelationship(): Promise<void> {
      throw new UnsupportedOperationError('createRelationship');
    },

    async registerModuleSchema(schema: ModuleSchema): Promise<void> {
      const document = await readModuleSchemaDocument(moduleSchemaPath);
      const deduped = document.schemas.filter(
        (existing) =>
          !(existing.meta.id === schema.meta.id && existing.meta.version === schema.meta.version),
      );
      deduped.push(schema);
      await writeModuleSchemaDocument(moduleSchemaPath, { schemas: deduped });
    },
  };
}
