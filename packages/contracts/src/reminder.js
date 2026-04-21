/**
 * Reminder contracts for execution and follow-through.
 */
import { z } from 'zod';
export const ReminderStatusSchema = z.enum(['pending', 'scheduled', 'fired', 'done', 'dismissed']);
export const ReminderChannelSchema = z.enum(['inbox', 'push', 'email']);
export const ReminderSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    note: z.string().min(1).optional(),
    dueAt: z.string().min(1),
    channel: ReminderChannelSchema,
    status: ReminderStatusSchema,
    taskId: z.string().min(1).optional(),
});
//# sourceMappingURL=reminder.js.map