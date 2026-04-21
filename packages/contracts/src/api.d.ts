/**
 * API request/response contracts for the hero loop endpoints.
 */
import { z } from 'zod';
export declare const CaptureCreateRequestSchema: z.ZodObject<{
    type: z.ZodEnum<{
        text: "text";
        voice: "voice";
    }>;
    content: z.ZodString;
    metadata: z.ZodOptional<z.ZodObject<{
        scope: z.ZodOptional<z.ZodLiteral<"household">>;
        householdId: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodEnum<{
            mobile: "mobile";
            ha_satellite: "ha_satellite";
            ha_bridge: "ha_bridge";
        }>>;
        sourceDeviceId: z.ZodOptional<z.ZodString>;
        targetHint: z.ZodOptional<z.ZodEnum<{
            shopping: "shopping";
            chore: "chore";
            reminder: "reminder";
            note: "note";
            unknown: "unknown";
        }>>;
        audioBase64: z.ZodOptional<z.ZodString>;
        durationMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const CaptureCreateResponseSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        text: "text";
        voice: "voice";
    }>;
    content: z.ZodString;
    processedAt: z.ZodNumber;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failed: "failed";
    }>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CaptureCreateRequest = z.infer<typeof CaptureCreateRequestSchema>;
export type CaptureCreateResponse = z.infer<typeof CaptureCreateResponseSchema>;
export declare const InboxListResponseSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        reminder: "reminder";
        approval: "approval";
        notification: "notification";
        capture: "capture";
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
}, z.core.$strip>>;
export type InboxListResponse = z.infer<typeof InboxListResponseSchema>;
export declare const PlanCreateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    createdAt: z.ZodString;
    deadline: z.ZodNullable<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<{
            todo: "todo";
            "in-progress": "in-progress";
            done: "done";
        }>;
        priority: z.ZodNumber;
        dueDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PlanCreateResponseSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    createdAt: z.ZodString;
    deadline: z.ZodNullable<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<{
            todo: "todo";
            "in-progress": "in-progress";
            done: "done";
        }>;
        priority: z.ZodNumber;
        dueDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PlanCreateRequest = z.infer<typeof PlanCreateRequestSchema>;
export type PlanCreateResponse = z.infer<typeof PlanCreateResponseSchema>;
export declare const ReminderScheduleRequestSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    dueAt: z.ZodString;
    channel: z.ZodEnum<{
        email: "email";
        inbox: "inbox";
        push: "push";
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
export declare const ReminderScheduleResponseSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    dueAt: z.ZodString;
    channel: z.ZodEnum<{
        email: "email";
        inbox: "inbox";
        push: "push";
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
export type ReminderScheduleRequest = z.infer<typeof ReminderScheduleRequestSchema>;
export type ReminderScheduleResponse = z.infer<typeof ReminderScheduleResponseSchema>;
export declare const ReviewGenerateRequestSchema: z.ZodObject<{
    period: z.ZodEnum<{
        daily: "daily";
        weekly: "weekly";
    }>;
}, z.core.$strip>;
export declare const ReviewGenerateResponseSchema: z.ZodObject<{
    period: z.ZodEnum<{
        daily: "daily";
        weekly: "weekly";
    }>;
    wins: z.ZodArray<z.ZodString>;
    nextActions: z.ZodArray<z.ZodString>;
    history: z.ZodOptional<z.ZodArray<z.ZodString>>;
    loopSummary: z.ZodObject<{
        pendingCaptures: z.ZodNumber;
        actionsDueToday: z.ZodNumber;
        unacknowledgedReminders: z.ZodNumber;
        completedActions: z.ZodArray<z.ZodString>;
        suggestedNextActions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    generatedAt: z.ZodString;
    source: z.ZodEnum<{
        manual: "manual";
        heuristic: "heuristic";
        llm: "llm";
    }>;
}, z.core.$strict>;
export type ReviewGenerateRequest = z.infer<typeof ReviewGenerateRequestSchema>;
export type ReviewGenerateResponse = z.infer<typeof ReviewGenerateResponseSchema>;
export declare const ApiErrorResponseSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        retryable: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
//# sourceMappingURL=api.d.ts.map