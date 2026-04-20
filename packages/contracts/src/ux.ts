/**
 * UX contracts shared across dashboard and clients.
 */

import { z } from 'zod';

export const HealthCheckKeySchema = z.enum([
  'storage',
  'model',
  'eventBus',
  'notifications',
  'sync',
  'auth',
]);
export type HealthCheckKey = z.infer<typeof HealthCheckKeySchema>;

export const HealthCheckStatusSchema = z.enum(['pass', 'warn', 'fail']);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

export const RepairActionSchema = z.object({
  label: z.string(),
  action: z.string(),
});
export type RepairAction = z.infer<typeof RepairActionSchema>;

export const HealthCheckResultSchema = z.object({
  key: HealthCheckKeySchema,
  status: HealthCheckStatusSchema,
  title: z.string(),
  detail: z.string(),
  repairAction: RepairActionSchema.nullable(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

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
export type UXPreferences = z.infer<typeof UXPreferencesSchema>;

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
export type OnboardingStage = z.infer<typeof OnboardingStageSchema>;

export const OnboardingProgressSchema = z.object({
  currentStage: OnboardingStageSchema,
  completedStages: z.array(OnboardingStageSchema),
  completedAt: z.string().nullable(),
});
export type OnboardingProgress = z.infer<typeof OnboardingProgressSchema>;

export const TourProgressSchema = z.object({
  pageId: z.string(),
  seen: z.boolean(),
  completedAt: z.string().nullable(),
});
export type TourProgress = z.infer<typeof TourProgressSchema>;
