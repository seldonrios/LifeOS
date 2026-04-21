/**
 * UX contracts shared across dashboard and clients.
 */
import { z } from 'zod';
export declare const HealthCheckKeySchema: z.ZodEnum<{
    auth: "auth";
    eventBus: "eventBus";
    storage: "storage";
    model: "model";
    notifications: "notifications";
    sync: "sync";
}>;
export type HealthCheckKey = z.infer<typeof HealthCheckKeySchema>;
export declare const HealthCheckStatusSchema: z.ZodEnum<{
    warn: "warn";
    pass: "pass";
    fail: "fail";
}>;
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;
export declare const RepairActionSchema: z.ZodObject<{
    label: z.ZodString;
    action: z.ZodString;
}, z.core.$strip>;
export type RepairAction = z.infer<typeof RepairActionSchema>;
export declare const HealthCheckResultSchema: z.ZodObject<{
    key: z.ZodEnum<{
        auth: "auth";
        eventBus: "eventBus";
        storage: "storage";
        model: "model";
        notifications: "notifications";
        sync: "sync";
    }>;
    status: z.ZodEnum<{
        warn: "warn";
        pass: "pass";
        fail: "fail";
    }>;
    title: z.ZodString;
    detail: z.ZodString;
    repairAction: z.ZodNullable<z.ZodObject<{
        label: z.ZodString;
        action: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export declare const UXPreferencesSchema: z.ZodObject<{
    assistantTone: z.ZodEnum<{
        concise: "concise";
        detailed: "detailed";
        conversational: "conversational";
    }>;
    assistantName: z.ZodOptional<z.ZodString>;
    wakePhrase: z.ZodOptional<z.ZodString>;
    localOnlyMode: z.ZodBoolean;
    proactiveSuggestions: z.ZodBoolean;
    tutorialsEnabled: z.ZodBoolean;
    setupStyle: z.ZodOptional<z.ZodEnum<{
        recommended: "recommended";
        private: "private";
        builder: "builder";
    }>>;
    useCases: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type UXPreferences = z.infer<typeof UXPreferencesSchema>;
export declare const OnboardingStageSchema: z.ZodEnum<{
    useCases: "useCases";
    permissions: "permissions";
    setupStyle: "setupStyle";
    welcome: "welcome";
    assistantStyle: "assistantStyle";
    firstCapture: "firstCapture";
    connectServices: "connectServices";
    healthCheck: "healthCheck";
    complete: "complete";
}>;
export type OnboardingStage = z.infer<typeof OnboardingStageSchema>;
export declare const OnboardingProgressSchema: z.ZodObject<{
    currentStage: z.ZodEnum<{
        useCases: "useCases";
        permissions: "permissions";
        setupStyle: "setupStyle";
        welcome: "welcome";
        assistantStyle: "assistantStyle";
        firstCapture: "firstCapture";
        connectServices: "connectServices";
        healthCheck: "healthCheck";
        complete: "complete";
    }>;
    completedStages: z.ZodArray<z.ZodEnum<{
        useCases: "useCases";
        permissions: "permissions";
        setupStyle: "setupStyle";
        welcome: "welcome";
        assistantStyle: "assistantStyle";
        firstCapture: "firstCapture";
        connectServices: "connectServices";
        healthCheck: "healthCheck";
        complete: "complete";
    }>>;
    completedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type OnboardingProgress = z.infer<typeof OnboardingProgressSchema>;
export declare const TourProgressSchema: z.ZodObject<{
    pageId: z.ZodString;
    seen: z.ZodBoolean;
    completedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type TourProgress = z.infer<typeof TourProgressSchema>;
export declare const AssistantProfileInputSchema: z.ZodObject<{
    assistantName: z.ZodDefault<z.ZodString>;
    wakePhrase: z.ZodDefault<z.ZodString>;
    assistantTone: z.ZodDefault<z.ZodEnum<{
        concise: "concise";
        detailed: "detailed";
        conversational: "conversational";
    }>>;
    useCases: z.ZodDefault<z.ZodArray<z.ZodString>>;
    avatarEmoji: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type AssistantProfileInput = z.infer<typeof AssistantProfileInputSchema>;
export declare const AssistantProfileSchema: z.ZodObject<{
    assistantName: z.ZodDefault<z.ZodString>;
    wakePhrase: z.ZodDefault<z.ZodString>;
    assistantTone: z.ZodDefault<z.ZodEnum<{
        concise: "concise";
        detailed: "detailed";
        conversational: "conversational";
    }>>;
    useCases: z.ZodDefault<z.ZodArray<z.ZodString>>;
    avatarEmoji: z.ZodDefault<z.ZodString>;
    userId: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type AssistantProfile = z.infer<typeof AssistantProfileSchema>;
