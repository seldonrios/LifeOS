/**
 * Planning contracts for the hero loop.
 */
import { z } from 'zod';
export declare const PlanPrioritySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
export type PlanPriority = z.infer<typeof PlanPrioritySchema>;
export declare const PlanTaskStatusSchema: z.ZodEnum<{
    todo: "todo";
    "in-progress": "in-progress";
    done: "done";
}>;
export type PlanTaskStatus = z.infer<typeof PlanTaskStatusSchema>;
export declare const PlanTaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        todo: "todo";
        "in-progress": "in-progress";
        done: "done";
    }>;
    priority: z.ZodNumber;
    dueDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;
export declare const PlanSchema: z.ZodObject<{
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
export type Plan = z.infer<typeof PlanSchema>;
export declare const PlanningSuggestionSchema: z.ZodObject<{
    rationale: z.ZodString;
    actions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type PlanningSuggestion = z.infer<typeof PlanningSuggestionSchema>;
export declare const PlanBlockedRequestSchema: z.ZodObject<{
    planId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PlanBlockedRequest = z.infer<typeof PlanBlockedRequestSchema>;
export declare const PlanAlternativesResponseSchema: z.ZodObject<{
    alternatives: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type PlanAlternativesResponse = z.infer<typeof PlanAlternativesResponseSchema>;
