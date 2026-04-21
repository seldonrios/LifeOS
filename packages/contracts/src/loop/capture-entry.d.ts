import { z } from 'zod';
export declare const CaptureEntrySchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    type: z.ZodEnum<{
        text: "text";
        voice: "voice";
    }>;
    capturedAt: z.ZodString;
    source: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    status: z.ZodEnum<{
        pending: "pending";
        triaged: "triaged";
    }>;
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
            unknown: "unknown";
            shopping: "shopping";
            chore: "chore";
            reminder: "reminder";
            note: "note";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export type CaptureEntry = z.infer<typeof CaptureEntrySchema>;
//# sourceMappingURL=capture-entry.d.ts.map