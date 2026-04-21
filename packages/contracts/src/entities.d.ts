/**
 * Canonical entity schemas for the Personal Ops hero loop.
 */
import type { z } from 'zod';
export declare const HeroLoopEntitySchemas: {
    readonly capture: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            text: "text";
            voice: "voice";
        }>;
        content: z.ZodString;
        processedAt: z.ZodNumber;
        status: z.ZodEnum<{
            pending: "pending";
            success: "success";
            failed: "failed";
        }>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly inbox: z.ZodObject<{
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
    readonly plan: z.ZodObject<{
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
    readonly reminder: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
        dueAt: z.ZodString;
        channel: z.ZodEnum<{
            push: "push";
            inbox: "inbox";
            email: "email";
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
    readonly review: z.ZodObject<{
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
            llm: "llm";
            heuristic: "heuristic";
        }>;
    }, z.core.$strict>;
};
export type HeroLoopEntitySchemaMap = typeof HeroLoopEntitySchemas;
export type HeroLoopEntityName = keyof HeroLoopEntitySchemaMap;
export type HeroLoopEntityValue<TName extends HeroLoopEntityName> = z.infer<HeroLoopEntitySchemaMap[TName]>;
