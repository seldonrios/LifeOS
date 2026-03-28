/**
 * Reminder contracts for execution and follow-through.
 */

import { z } from 'zod';

export const ReminderStatusSchema = z.enum(['pending', 'scheduled', 'fired', 'done', 'dismissed']);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

export const ReminderChannelSchema = z.enum(['inbox', 'push', 'email']);
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;

export const ReminderSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  note: z.string().min(1).optional(),
  dueAt: z.string().min(1),
  channel: ReminderChannelSchema,
  status: ReminderStatusSchema,
  taskId: z.string().min(1).optional(),
});
export type Reminder = z.infer<typeof ReminderSchema>;
