/**
 * Event envelope contracts for the Personal Ops hero loop.
 */

import { z } from 'zod';

import { ReminderEventSchema } from './loop/reminder-event';
import { Topics } from './topics';

const RuntimeTaskCompletedPayloadSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  completionSource: z.enum(['task', 'planned-action']),
  goalId: z.string().min(1).optional(),
  goalTitle: z.string().min(1).optional(),
  sourceCapture: z.string().min(1).optional(),
  completedAt: z.string().min(1),
});

const RuntimeTickOverduePayloadSchema = z.object({
  checkedTasks: z.number().int().nonnegative(),
  overdueTasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      goalTitle: z.string().min(1),
      dueDate: z.string().min(1),
    }),
  ),
  tickedAt: z.string().min(1),
});

const RuntimeCaptureRecordedPayloadSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  source: z.string().min(1),
  capturedAt: z.string().min(1),
});

const RuntimeInboxTriagedPayloadSchema = z.object({
  captureId: z.string().min(1),
  action: z.enum(['task', 'note', 'defer']),
  plannedActionId: z.string().min(1).optional(),
});

const RuntimeReminderFollowupCreatedPayloadSchema = z.object({
  followUpPlanId: z.string().min(1),
  overdueCount: z.number().int().nonnegative(),
  tickEventId: z.string().min(1),
  createdAt: z.string().min(1),
});

export const RuntimeHeroLoopEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(Topics.lifeos.reminderScheduled),
    payload: ReminderEventSchema.pick({ id: true, actionId: true, scheduledFor: true }),
  }),
  z.object({
    type: z.literal(Topics.lifeos.reminderFollowupCreated),
    payload: RuntimeReminderFollowupCreatedPayloadSchema,
  }),
  z.object({
    type: z.literal(Topics.lifeos.taskCompleted),
    payload: RuntimeTaskCompletedPayloadSchema,
  }),
  z.object({
    type: z.literal(Topics.lifeos.tickOverdue),
    payload: RuntimeTickOverduePayloadSchema,
  }),
  z.object({
    type: z.literal(Topics.lifeos.captureRecorded),
    payload: RuntimeCaptureRecordedPayloadSchema,
  }),
  z.object({
    type: z.literal(Topics.lifeos.inboxTriaged),
    payload: RuntimeInboxTriagedPayloadSchema,
  }),
]);

export type RuntimeHeroLoopEvent = z.infer<typeof RuntimeHeroLoopEventSchema>;

/** @deprecated Use RuntimeHeroLoopEventSchema. Will be removed in next cleanup pass. */
export const HeroLoopEventSchema = RuntimeHeroLoopEventSchema;

/** @deprecated Use RuntimeHeroLoopEvent. */
export type HeroLoopEvent = RuntimeHeroLoopEvent;
