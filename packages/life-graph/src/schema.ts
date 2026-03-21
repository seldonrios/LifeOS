import { z } from 'zod';

import type { LifeGraphDocument, LocalLifeGraph } from './types';

export const LIFE_GRAPH_VERSION = '0.1.0' as const;

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const GoalPlanRecordSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: IsoDateTimeSchema,
    input: z.string().trim().min(1),
    plan: z.unknown(),
  })
  .strict();

export const LifeGraphDocumentSchema = z
  .object({
    version: z.literal(LIFE_GRAPH_VERSION),
    updatedAt: IsoDateTimeSchema,
    goals: z.array(GoalPlanRecordSchema),
  })
  .strict();

const LegacyLocalLifeGraphSchema = z
  .object({
    goals: z.array(GoalPlanRecordSchema),
  })
  .strict();

export function parseVersionedLifeGraphDocument<TPlan = Record<string, unknown>>(
  value: unknown,
): LifeGraphDocument<TPlan> {
  return LifeGraphDocumentSchema.parse(value) as LifeGraphDocument<TPlan>;
}

export function parseLegacyLocalLifeGraph<TPlan = Record<string, unknown>>(
  value: unknown,
): LocalLifeGraph<TPlan> {
  return LegacyLocalLifeGraphSchema.parse(value) as LocalLifeGraph<TPlan>;
}

export function normalizeLifeGraphDocument<TPlan = Record<string, unknown>>(
  value: unknown,
  now: Date = new Date(),
): LifeGraphDocument<TPlan> {
  const versioned = LifeGraphDocumentSchema.safeParse(value);
  if (versioned.success) {
    return versioned.data as LifeGraphDocument<TPlan>;
  }

  const legacy = parseLegacyLocalLifeGraph<TPlan>(value);
  return {
    version: LIFE_GRAPH_VERSION,
    updatedAt: now.toISOString(),
    goals: legacy.goals,
  };
}
