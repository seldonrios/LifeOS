import { z } from 'zod';

import type { GoalPlan, LifeGraphDocument, LifeGraphTask } from './types';

export const LIFE_GRAPH_VERSION = '0.1.0' as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const DateOnlySchema = z.string().regex(DATE_ONLY_PATTERN);

export const LifeGraphTaskSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
    priority: z.number().int().min(1).max(5).default(3),
    dueDate: DateOnlySchema.optional(),
    voiceTriggered: z.boolean().optional(),
    suggestedReschedule: IsoDateTimeSchema.optional(),
  })
  .strict();

export const EnhancedTaskSchema = LifeGraphTaskSchema;

export const CalendarEventSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
    attendees: z.array(z.string().trim().min(1)).optional(),
    location: z.string().trim().min(1).optional(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
  })
  .strict();

export const GoalPlanSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    deadline: z.union([DateOnlySchema, z.null()]).default(null),
    tasks: z.array(LifeGraphTaskSchema),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const LifeGraphDocumentSchema = z
  .object({
    version: z.literal(LIFE_GRAPH_VERSION),
    updatedAt: IsoDateTimeSchema,
    plans: z.array(GoalPlanSchema),
    calendarEvents: z.array(CalendarEventSchema).default([]),
  })
  .strict();

export const LifeGraphSchema = LifeGraphDocumentSchema;

export const LegacyGoalPlanRecordSchema = z
  .object({
    id: z.string().trim().min(1),
    createdAt: IsoDateTimeSchema,
    input: z.string().trim().min(1),
    plan: z.unknown(),
  })
  .strict();

export const LegacyVersionedLifeGraphDocumentSchema = z
  .object({
    version: z.literal(LIFE_GRAPH_VERSION),
    updatedAt: IsoDateTimeSchema,
    goals: z.array(LegacyGoalPlanRecordSchema),
  })
  .strict();

export const LegacyLocalLifeGraphSchema = z
  .object({
    goals: z.array(LegacyGoalPlanRecordSchema),
  })
  .strict();

export type ParsedGoalPlan = z.infer<typeof GoalPlanSchema>;
export type ParsedLifeGraphTask = z.infer<typeof LifeGraphTaskSchema>;

export function parseVersionedLifeGraphDocument(value: unknown): LifeGraphDocument {
  return LifeGraphDocumentSchema.parse(value) as LifeGraphDocument;
}

export function parseGoalPlan(value: unknown): GoalPlan {
  return GoalPlanSchema.parse(value) as GoalPlan;
}

export function parseTask(value: unknown): LifeGraphTask {
  return LifeGraphTaskSchema.parse(value) as LifeGraphTask;
}

export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY_PATTERN.test(value);
}
