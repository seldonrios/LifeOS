/**
 * Planning contracts for the hero loop.
 */
import { z } from 'zod';
export const PlanPrioritySchema = z.enum(['low', 'medium', 'high']);
export const PlanTaskStatusSchema = z.enum(['todo', 'in-progress', 'done']);
export const PlanTaskSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: PlanTaskStatusSchema,
    priority: z.number().int().min(1).max(5),
    dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
});
export const PlanSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    createdAt: z.string().min(1),
    deadline: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    priority: PlanPrioritySchema.default('medium'),
    tasks: z.array(PlanTaskSchema),
});
export const PlanningSuggestionSchema = z.object({
    rationale: z.string().min(1),
    actions: z.array(z.string().min(1)).min(1),
});
export const PlanBlockedRequestSchema = z.object({
    planId: z.string().min(1),
    reason: z.string().min(1).optional(),
});
export const PlanAlternativesResponseSchema = z.object({
    alternatives: z.array(z.string().min(1)),
});
//# sourceMappingURL=plan.js.map