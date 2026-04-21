/**
 * Inbox contracts shared across clients.
 */
import { z } from 'zod';
export declare const ApprovalRequestSchema: z.ZodObject<{
    requestId: z.ZodString;
    action: z.ZodString;
    context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    deadline: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export declare const ApprovalResultSchema: z.ZodObject<{
    requestId: z.ZodString;
    approved: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodNumber;
}, z.core.$strip>;
export type ApprovalResult = z.infer<typeof ApprovalResultSchema>;
export declare const InboxItemTypeSchema: z.ZodEnum<{
    reminder: "reminder";
    capture: "capture";
    approval: "approval";
    notification: "notification";
}>;
export type InboxItemType = z.infer<typeof InboxItemTypeSchema>;
export declare const InboxActionRequestSchema: z.ZodObject<{
    captureId: z.ZodString;
    action: z.ZodEnum<{
        delete: "delete";
        defer: "defer";
        "make-plan": "make-plan";
        "save-note": "save-note";
    }>;
}, z.core.$strip>;
export type InboxActionRequest = z.infer<typeof InboxActionRequestSchema>;
export declare const ReviewCloseDayRequestSchema: z.ZodObject<{
    tomorrowNote: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ReviewCloseDayRequest = z.infer<typeof ReviewCloseDayRequestSchema>;
export declare const ReminderInboxPayloadSchema: z.ZodObject<{
    dueDate: z.ZodString;
    actionId: z.ZodString;
    reminderId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ReminderInboxPayload = z.infer<typeof ReminderInboxPayloadSchema>;
export declare const InboxItemDataSchema: z.ZodUnion<readonly [z.ZodObject<{
    requestId: z.ZodString;
    action: z.ZodString;
    context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    deadline: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    dueDate: z.ZodString;
    actionId: z.ZodString;
    reminderId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    module: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
export type InboxItemData = z.infer<typeof InboxItemDataSchema>;
export declare const InboxItemSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        reminder: "reminder";
        capture: "capture";
        approval: "approval";
        notification: "notification";
    }>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodNumber;
    read: z.ZodBoolean;
    data: z.ZodUnion<readonly [z.ZodObject<{
        requestId: z.ZodString;
        action: z.ZodString;
        context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        deadline: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        dueDate: z.ZodString;
        actionId: z.ZodString;
        reminderId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        module: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
}, z.core.$strip>;
export type InboxItem = z.infer<typeof InboxItemSchema>;
