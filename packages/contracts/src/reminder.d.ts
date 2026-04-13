/**
 * Reminder contracts for execution and follow-through.
 */
import { z } from 'zod';
export declare const ReminderStatusSchema: z.ZodEnum<{
    pending: "pending";
    done: "done";
    scheduled: "scheduled";
    fired: "fired";
    dismissed: "dismissed";
}>;
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export declare const ReminderChannelSchema: z.ZodEnum<{
    push: "push";
    email: "email";
    inbox: "inbox";
}>;
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;
export declare const ReminderSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    dueAt: z.ZodString;
    channel: z.ZodEnum<{
        push: "push";
        email: "email";
        inbox: "inbox";
    }>;
    status: z.ZodEnum<{
        pending: "pending";
        done: "done";
        scheduled: "scheduled";
        fired: "fired";
        dismissed: "dismissed";
    }>;
    taskId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Reminder = z.infer<typeof ReminderSchema>;
