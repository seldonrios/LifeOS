/**
 * Inbox contracts shared across clients.
 */
import { z } from 'zod';
export const ApprovalRequestSchema = z.object({
    requestId: z.string().min(1),
    action: z.string().min(1),
    context: z.record(z.string(), z.unknown()),
    deadline: z.number().int().nonnegative().optional(),
});
export const ApprovalResultSchema = z.object({
    requestId: z.string().min(1),
    approved: z.boolean(),
    reason: z.string().min(1).optional(),
    timestamp: z.number().int().nonnegative(),
});
export const InboxItemTypeSchema = z.enum(['approval', 'notification', 'reminder']);
export const ReminderInboxPayloadSchema = z.object({
    dueDate: z.string().min(1),
    actionId: z.string().min(1),
    reminderId: z.string().min(1).optional(),
});
const NotificationInboxPayloadSchema = z.object({
    module: z.string().min(1).optional(),
});
export const InboxItemDataSchema = z.union([
    ApprovalRequestSchema,
    ReminderInboxPayloadSchema,
    NotificationInboxPayloadSchema,
    z.record(z.string(), z.unknown()),
]);
export const InboxItemSchema = z.object({
    id: z.string().min(1),
    type: InboxItemTypeSchema,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    createdAt: z.number().int().nonnegative(),
    read: z.boolean(),
    data: InboxItemDataSchema,
});
