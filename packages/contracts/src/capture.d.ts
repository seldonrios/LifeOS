/**
 * Data capture contracts shared across clients.
 */
import { z } from 'zod';
export declare const CaptureTypeSchema: z.ZodEnum<{
    text: "text";
    voice: "voice";
}>;
export type CaptureType = z.infer<typeof CaptureTypeSchema>;
export declare const CaptureRequestSchema: z.ZodObject<{
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
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;
export type CaptureRequestMetadata = z.infer<NonNullable<typeof CaptureRequestSchema.shape.metadata>>;
export declare const CaptureStatusSchema: z.ZodEnum<{
    success: "success";
    pending: "pending";
    failed: "failed";
}>;
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;
export declare const CaptureResultSchema: z.ZodObject<{
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
export type CaptureResult = z.infer<typeof CaptureResultSchema>;
export declare const CaptureListItemSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    type: z.ZodString;
    capturedAt: z.ZodString;
    source: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    status: z.ZodString;
}, z.core.$strip>;
export type CaptureListItem = z.infer<typeof CaptureListItemSchema>;
//# sourceMappingURL=capture.d.ts.map