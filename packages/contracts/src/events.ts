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

export const RuntimeHeroLoopEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(Topics.lifeos.reminderFollowupCreated),
    payload: ReminderEventSchema.pick({ id: true, actionId: true, scheduledFor: true }),
  }),
  z.object({
    type: z.literal(Topics.lifeos.taskCompleted),
    payload: RuntimeTaskCompletedPayloadSchema,
  }),
  z.object({
    type: z.literal(Topics.lifeos.tickOverdue),
    payload: RuntimeTickOverduePayloadSchema,
  }),
]);

export type RuntimeHeroLoopEvent = z.infer<typeof RuntimeHeroLoopEventSchema>;

/** @deprecated Use RuntimeHeroLoopEventSchema. Will be removed in next cleanup pass. */
export const HeroLoopEventSchema = RuntimeHeroLoopEventSchema;

/** @deprecated Use RuntimeHeroLoopEvent. */
export type HeroLoopEvent = RuntimeHeroLoopEvent;
