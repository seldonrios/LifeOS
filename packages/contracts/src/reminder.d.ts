/**
 * Reminder contracts for execution and follow-through.
 */
import { z } from 'zod';
export declare const ReminderStatusSchema: z.ZodEnum<{
    scheduled: "scheduled";
    fired: "fired";
    done: "done";
    pending: "pending";
    dismissed: "dismissed";
}>;
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export declare const ReminderChannelSchema: z.ZodEnum<{
    inbox: "inbox";
    push: "push";
    email: "email";
}>;
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;
export declare const ReminderSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    dueAt: z.ZodString;
    channel: z.ZodEnum<{
        inbox: "inbox";
        push: "push";
        email: "email";
    }>;
    status: z.ZodEnum<{
        scheduled: "scheduled";
        fired: "fired";
        done: "done";
        pending: "pending";
        dismissed: "dismissed";
    }>;
    taskId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Reminder = z.infer<typeof ReminderSchema>;
//# sourceMappingURL=reminder.d.ts.map