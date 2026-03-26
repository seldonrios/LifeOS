import { randomUUID } from 'node:crypto';
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

export const NoteSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).default([]),
    voiceTriggered: z.boolean().default(true),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const ResearchResultSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z
      .string()
      .uuid()
      .default(() => randomUUID()),
    query: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    conversationContext: z.array(z.string().trim().min(1)).default([]),
    sources: z.array(z.string().trim().min(1)).optional(),
    savedAt: IsoDateTimeSchema,
  })
  .strict();

export const WeatherSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    location: z.string().trim().min(1),
    forecast: z.string().trim().min(1),
    timestamp: IsoDateTimeSchema,
  })
  .strict();

export const NewsDigestSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    sources: z.array(z.string().trim().min(1)),
    read: z.boolean().default(false),
  })
  .strict();

export const EmailDigestSchema = z
  .object({
    id: z.string().uuid(),
    subject: z.string().trim().min(1),
    from: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    messageId: z.string().trim().min(1),
    receivedAt: IsoDateTimeSchema,
    read: z.boolean().default(false),
    accountLabel: z.string().trim().min(1),
  })
  .strict();

export const HealthMetricEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    metric: z.string().trim().min(1),
    value: z.number().finite(),
    unit: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
    loggedAt: IsoDateTimeSchema,
  })
  .strict();

export const HealthDailyStreakSchema = z
  .object({
    id: z.string().trim().min(1),
    metric: z.string().trim().min(1),
    currentStreak: z.number().int().min(0),
    longestStreak: z.number().int().min(0),
    lastLoggedDate: DateOnlySchema,
  })
  .strict();

export const MemoryEntrySchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['conversation', 'research', 'note', 'insight', 'preference']),
    content: z.string().trim().min(1),
    embedding: z.array(z.number()),
    timestamp: IsoDateTimeSchema,
    relatedTo: z.array(z.string().trim().min(1)).default([]),
    threadId: z.string().uuid().optional(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
    key: z.string().trim().min(1).optional(),
    value: z.string().trim().min(1).optional(),
    summaryOfThreadId: z.string().uuid().optional(),
  })
  .strict();

const RiskStatusSchema = z.enum(['green', 'yellow', 'red']);

const RiskRadarItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    status: RiskStatusSchema,
    lastChecked: IsoDateTimeSchema,
    details: z.string().trim().min(1).optional(),
  })
  .strict();

const RiskRadarSchema = z
  .object({
    overallHealth: RiskStatusSchema,
    lastUpdated: IsoDateTimeSchema,
    risks: z.array(RiskRadarItemSchema),
    recommendations: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

const LifeGraphSystemMetaSchema = z
  .object({
    riskRadar: RiskRadarSchema.optional(),
  })
  .strict();

const LifeGraphSystemNodeSchema = z
  .object({
    meta: LifeGraphSystemMetaSchema.default({}),
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
    notes: z.array(NoteSchema).default([]),
    researchResults: z.array(ResearchResultSchema).default([]),
    weatherSnapshots: z.array(WeatherSnapshotSchema).default([]),
    newsDigests: z.array(NewsDigestSchema).default([]),
    emailDigests: z.array(EmailDigestSchema).default([]),
    healthMetricEntries: z.array(HealthMetricEntrySchema).default([]),
    healthDailyStreaks: z.array(HealthDailyStreakSchema).default([]),
    memory: z.array(MemoryEntrySchema).default([]),
    system: LifeGraphSystemNodeSchema.default({ meta: {} }),
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
