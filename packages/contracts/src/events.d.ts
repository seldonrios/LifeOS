/**
 * Event envelope contracts for the Personal Ops hero loop.
 */
import { z } from 'zod';
export declare const HeroLoopEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"lifeos.capture.recorded">;
    timestamp: z.ZodString;
    payload: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            voice: "voice";
            text: "text";
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
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"lifeos.inbox.item.created">;
    timestamp: z.ZodString;
    payload: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            reminder: "reminder";
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
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"lifeos.plan.created">;
    timestamp: z.ZodString;
    payload: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"lifeos.reminder.scheduled">;
    timestamp: z.ZodString;
    payload: z.ZodObject<{
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
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"lifeos.review.generated">;
    timestamp: z.ZodString;
    payload: z.ZodObject<{
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
}, z.core.$strip>], "type">;
export type HeroLoopEvent = z.infer<typeof HeroLoopEventSchema>;
