/**
 * UX contracts shared across dashboard and clients.
 */
import { z } from 'zod';
const GraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function isSingleEmojiGraphemeOrEmpty(value) {
    if (value.length === 0) {
        return true;
    }
    const graphemeCount = [...GraphemeSegmenter.segment(value)].length;
    if (graphemeCount !== 1) {
        return false;
    }
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}
export const HealthCheckKeySchema = z.enum([
    'storage',
    'model',
    'eventBus',
    'notifications',
    'sync',
    'auth',
]);
export const HealthCheckStatusSchema = z.enum(['pass', 'warn', 'fail']);
export const RepairActionSchema = z.object({
    label: z.string(),
    action: z.string(),
});
export const HealthCheckResultSchema = z.object({
    key: HealthCheckKeySchema,
    status: HealthCheckStatusSchema,
    title: z.string(),
    detail: z.string(),
    repairAction: RepairActionSchema.nullable(),
});
export const UXPreferencesSchema = z.object({
    assistantTone: z.enum(['concise', 'detailed', 'conversational']),
    assistantName: z.string().min(1).max(32).optional(),
    wakePhrase: z.string().min(1).max(64).optional(),
    localOnlyMode: z.boolean(),
    proactiveSuggestions: z.boolean(),
    tutorialsEnabled: z.boolean(),
    setupStyle: z.enum(['recommended', 'private', 'builder']).optional(),
    useCases: z.array(z.string()).optional(),
});
export const OnboardingStageSchema = z.enum([
    'welcome',
    'setupStyle',
    'useCases',
    'assistantStyle',
    'firstCapture',
    'connectServices',
    'permissions',
    'healthCheck',
    'complete',
]);
export const OnboardingProgressSchema = z.object({
    currentStage: OnboardingStageSchema,
    completedStages: z.array(OnboardingStageSchema),
    completedAt: z.string().nullable(),
});
export const TourProgressSchema = z.object({
    pageId: z.string(),
    seen: z.boolean(),
    completedAt: z.string().nullable(),
});
export const AssistantProfileInputSchema = z.object({
    assistantName: z.string().trim().min(1).max(32).default('LifeOS'),
    wakePhrase: z.string().trim().min(1).max(64).default('Hey LifeOS'),
    assistantTone: z.enum(['concise', 'detailed', 'conversational']).default('concise'),
    useCases: z.array(z.string().max(32)).max(10).default([]),
    avatarEmoji: z.string().refine(isSingleEmojiGraphemeOrEmpty).default('🤖'),
});
export const AssistantProfileSchema = AssistantProfileInputSchema.extend({
    userId: z.string(),
    updatedAt: z.string(),
});
