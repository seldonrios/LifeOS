import { z } from 'zod';
import { IsoDateTimeSchema } from './loop/shared';
export const HouseholdRoleSchema = z.enum(['Admin', 'Adult', 'Teen', 'Child', 'Guest']);
export const HouseholdMemberStatusSchema = z.enum(['active', 'invited', 'suspended']);
export const ChoreStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
export const ShoppingItemStatusSchema = z.enum(['added', 'in_cart', 'purchased']);
export const HouseholdCreateRequestSchema = z.object({
    name: z.string().min(1),
});
export const HouseholdInviteMemberRequestSchema = z.object({
    invitedUserId: z.string().min(1),
    role: HouseholdRoleSchema,
});
export const HouseholdJoinRequestSchema = z.object({
    inviteToken: z.string().min(1),
});
export const HouseholdChangeMemberRoleRequestSchema = z.object({
    role: HouseholdRoleSchema,
});
export const HouseholdAddShoppingItemRequestSchema = z.object({
    listId: z.string().min(1).optional(),
    title: z.string().min(1),
    source: z.enum(['manual', 'voice', 'routine']),
});
export const HouseholdUpdateShoppingItemStatusRequestSchema = z.object({
    status: ShoppingItemStatusSchema,
});
export const HouseholdCreateChoreRequestSchema = z.object({
    title: z.string().min(1),
    assignedToUserId: z.string().min(1),
    dueAt: IsoDateTimeSchema,
    recurrenceRule: z.string().optional(),
});
export const HouseholdCreateReminderRequestSchema = z.object({
    objectType: z.string().min(1),
    objectId: z.string().min(1),
    targetUserIds: z.array(z.string().min(1)),
    remindAt: IsoDateTimeSchema,
});
export const HouseholdCreateNoteRequestSchema = z.object({
    body: z.string().min(1),
});
export const HouseholdMemberInvitedSchema = z.object({
    householdId: z.string().min(1),
    invitedUserId: z.string().min(1),
    role: HouseholdRoleSchema,
    inviteToken: z.string().min(1),
    expiresAt: IsoDateTimeSchema,
});
export const HouseholdMemberJoinedSchema = z.object({
    householdId: z.string().min(1),
    userId: z.string().min(1),
    role: HouseholdRoleSchema,
    joinedAt: IsoDateTimeSchema,
});
export const HouseholdMemberRoleChangedSchema = z.object({
    householdId: z.string().min(1),
    userId: z.string().min(1),
    previousRole: HouseholdRoleSchema,
    newRole: HouseholdRoleSchema,
});
export const HouseholdChoreAssignedSchema = z.object({
    householdId: z.string().min(1),
    choreId: z.string().min(1),
    choreTitle: z.string().min(1),
    assignedToUserId: z.string().min(1),
    dueAt: IsoDateTimeSchema,
    recurrenceRule: z.string().optional(),
});
export const HouseholdChoreCompletedSchema = z.object({
    householdId: z.string().min(1),
    choreId: z.string().min(1),
    choreTitle: z.string().min(1),
    completedByUserId: z.string().min(1),
    completedAt: IsoDateTimeSchema,
    streakCount: z.number().int().nonnegative(),
});
export const HouseholdShoppingItemAddedSchema = z.object({
    householdId: z.string().min(1),
    listId: z.string().min(1),
    itemId: z.string().min(1),
    title: z.string().min(1),
    addedByUserId: z.string().min(1),
    source: z.enum(['manual', 'voice', 'routine']),
});
export const HouseholdShoppingItemPurchasedSchema = z.object({
    householdId: z.string().min(1),
    listId: z.string().min(1),
    itemId: z.string().min(1),
    title: z.string().min(1),
    purchasedByUserId: z.string().min(1),
    purchasedAt: IsoDateTimeSchema,
});
export const HouseholdCalendarEventCreatedSchema = z.object({
    householdId: z.string().min(1),
    calendarId: z.string().min(1),
    eventId: z.string().min(1),
    title: z.string().min(1),
    startAt: IsoDateTimeSchema,
    endAt: IsoDateTimeSchema,
    recurrenceRule: z.string().optional(),
    reminderAt: IsoDateTimeSchema.optional(),
    attendeeUserIds: z.array(z.string().min(1)),
});
export const HouseholdVoiceCaptureCreatedSchema = z.object({
    captureId: z.string().min(1),
    householdId: z.string().min(1),
    actorUserId: z.string().min(1),
    text: z.string().min(1),
    audioRef: z.string().min(1).nullable(),
    source: z.enum(['mobile', 'ha_satellite', 'ha_bridge']),
    sourceDeviceId: z.string().min(1).optional(),
    targetHint: z.enum(['shopping', 'chore', 'reminder', 'note', 'unknown']).optional(),
    createdAt: IsoDateTimeSchema,
});
export const HomeNodeVoiceSessionStartedSchema = z.object({
    session_id: z.string().min(1),
    household_id: z.string().min(1),
    surface_id: z.string().min(1),
    started_at: IsoDateTimeSchema,
});
export const HomeNodeVoiceSessionCompletedSchema = z.object({
    session_id: z.string().min(1),
    household_id: z.string().min(1),
    surface_id: z.string().min(1),
    capture_id: z.string().min(1),
    transcript: z.string().min(1),
    target_hint: z.enum(['shopping', 'chore', 'reminder', 'note', 'unknown']).optional(),
    completed_at: IsoDateTimeSchema,
});
export const HomeNodeVoiceSessionFailedSchema = z.object({
    session_id: z.string().min(1),
    household_id: z.string().min(1),
    surface_id: z.string().min(1),
    reason: z.string().min(1),
    detail: z.string().min(1).optional(),
    failed_at: IsoDateTimeSchema,
});
export const HouseholdShoppingItemAddRequestedSchema = z.object({
    householdId: z.string().min(1),
    actorUserId: z.string().min(1),
    originalCaptureId: z.string().min(1),
    text: z.string().min(1),
    itemTitle: z.string().min(1),
});
export const HouseholdChoreCreateRequestedSchema = z.object({
    householdId: z.string().min(1),
    actorUserId: z.string().min(1),
    originalCaptureId: z.string().min(1),
    text: z.string().min(1),
    choreTitle: z.string().min(1),
});
export const HouseholdReminderCreateRequestedSchema = z.object({
    householdId: z.string().min(1),
    actorUserId: z.string().min(1),
    originalCaptureId: z.string().min(1),
    text: z.string().min(1),
    reminderText: z.string().min(1),
});
export const HouseholdNoteCreateRequestedSchema = z.object({
    householdId: z.string().min(1),
    actorUserId: z.string().min(1),
    originalCaptureId: z.string().min(1),
    text: z.string().min(1),
    noteBody: z.string().min(1),
});
export const HouseholdCaptureUnresolvedSchema = z.object({
    captureId: z.string().min(1),
    householdId: z.string().min(1),
    text: z.string().min(1),
    reason: z.string().min(1),
});
export const HouseholdAutomationFailedSchema = z.object({
    household_id: z.string().min(1),
    actor_id: z.string().min(1),
    action_type: z.string().min(1),
    error_code: z.string().min(1),
    fix_suggestion: z.string().min(1),
    span_id: z.string().min(1),
    trace_id: z.string().min(1).optional(),
    object_id: z.string().min(1).optional(),
    object_ref: z.string().min(1).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
});
export const HouseholdCaptureStatusSchema = z.enum(['pending', 'resolved', 'unresolved']);
export const HouseholdCaptureStatusResponseSchema = z.object({
    status: HouseholdCaptureStatusSchema,
    resolvedAction: z.string().min(1).optional(),
    objectId: z.string().min(1).optional(),
});
export const HouseholdHomeStateChangedSchema = z.object({
    householdId: z.string().min(1),
    deviceId: z.string().min(1),
    stateKey: z.string().min(1),
    previousValue: z.unknown(),
    newValue: z.unknown(),
    source: z.enum(['ha_bridge', 'manual', 'routine']),
    consentVerified: z.boolean(),
});
export const HouseholdHomeStateConfigSchema = z.object({
    haIntegrationEnabled: z.boolean().optional(),
    haConsentedStateKeys: z.array(z.string().min(1)).optional(),
    timeZone: z.string().optional(),
});
export const HouseholdUpdateConfigRequestSchema = z
    .object({
    haIntegrationEnabled: z.boolean().optional(),
    haConsentedStateKeys: z.array(z.string().min(1)).optional(),
    timeZone: z
        .string()
        .optional()
        .refine((value) => value === undefined || Intl.supportedValuesOf('timeZone').includes(value), {
        message: 'Invalid IANA time zone',
    }),
})
    .refine((value) => value.haIntegrationEnabled !== undefined ||
    value.haConsentedStateKeys !== undefined ||
    value.timeZone !== undefined, {
    message: 'At least one config field is required',
});
export const HouseholdHaWebhookRequestSchema = z
    .object({
    deviceId: z.string().min(1),
    stateKey: z.string().min(1),
    previousValue: z.unknown().optional(),
    newValue: z.unknown(),
    voice_transcript: z.string().min(1).optional(),
    voiceTranscript: z.string().min(1).optional(),
    sourceDeviceId: z.string().min(1).optional(),
    actorUserId: z.string().min(1).optional(),
    targetHint: z.enum(['shopping', 'chore', 'reminder', 'note', 'unknown']).optional(),
})
    .transform((value) => {
    const { voiceTranscript, ...rest } = value;
    return {
        ...rest,
        voice_transcript: value.voice_transcript ?? voiceTranscript,
    };
});
export const HomeStateChangeSchema = z.object({
    id: z.string().min(1),
    deviceId: z.string().min(1),
    stateKey: z.string().min(1),
    previousValue: z.unknown(),
    newValue: z.unknown(),
    source: z.enum(['ha_bridge', 'manual', 'routine']),
    consentVerified: z.boolean(),
    createdAt: IsoDateTimeSchema,
});
export const HouseholdContextSummarySchema = z.object({
    membersHome: z.array(z.string().min(1)),
    activeDevices: z.array(z.string().min(1)),
    recentStateChanges: z.array(HomeStateChangeSchema),
});
export const HouseholdReminderFiredSchema = z.object({
    householdId: z.string().min(1),
    reminderId: z.string().min(1),
    objectType: z.enum(['chore', 'event', 'shopping', 'routine', 'custom']),
    objectId: z.string().min(1),
    targetUserIds: z.array(z.string().min(1)),
    firedAt: IsoDateTimeSchema,
    deliveryStatus: z.enum(['delivered', 'failed', 'quiet_hours_suppressed']),
});
export const AuditLogEntrySchema = z.object({
    id: z.string().min(1),
    householdId: z.string().min(1),
    actorId: z.string().min(1),
    actionType: z.string().min(1),
    objectRef: z.string().min(1),
    payloadJson: z.record(z.string(), z.unknown()),
    createdAt: IsoDateTimeSchema,
});
// ─── Phase 6 ambient schemas ──────────────────────────────────────────────────
export const SurfaceKindSchema = z.enum([
    'kitchen_display',
    'hallway_display',
    'living_room_display',
    'desk_display',
    'voice_endpoint',
    'mobile_app',
]);
export const SurfaceTrustLevelSchema = z.enum(['personal', 'household', 'guest']);
export const SurfaceCapabilitySchema = z.enum([
    'read',
    'quick-action',
    'full-action',
    'voice-capture',
    'voice-confirm',
]);
export const HomeNodeSurfaceSchema = z
    .object({
    surface_id: z.string().min(1),
    zone_id: z.string().min(1),
    kind: SurfaceKindSchema,
    trust_level: SurfaceTrustLevelSchema,
    capabilities: z.array(SurfaceCapabilitySchema),
    active: z.boolean(),
    registered_at: IsoDateTimeSchema,
})
    .strict();
export const HomeNodeZoneTypeSchema = z.enum([
    'kitchen',
    'hallway',
    'bedroom',
    'office',
    'entryway',
    'living_room',
    'other',
]);
export const HomeNodeZoneSchema = z
    .object({
    zone_id: z.string().min(1),
    home_id: z.string().min(1),
    name: z.string().min(1),
    type: HomeNodeZoneTypeSchema,
})
    .strict();
export const HomeNodeHomeSchema = z
    .object({
    home_id: z.string().min(1),
    household_id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
    quiet_hours_start: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    quiet_hours_end: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    routine_profile: z.string().optional(),
})
    .strict();
export const HomeModeSchema = z.enum([
    'home',
    'away',
    'sleep',
    'quiet_hours',
    'morning_routine',
    'evening_routine',
    'guest_mode',
    'vacation_mode',
]);
export const HomeStateSnapshotSchema = z
    .object({
    home_mode: HomeModeSchema,
    occupancy_summary: z.string().min(1),
    active_routines: z.array(z.string().min(1)),
    adapter_health: z.enum(['healthy', 'degraded', 'unavailable']),
    snapshot_at: IsoDateTimeSchema,
})
    .strict();
export const HomeNodeSurfaceRegisteredSchema = z
    .object({
    surface_id: z.string().min(1),
    zone_id: z.string().min(1),
    home_id: z.string().min(1),
    household_id: z.string().min(1),
    kind: SurfaceKindSchema,
    trust_level: SurfaceTrustLevelSchema,
    capabilities: z.array(SurfaceCapabilitySchema),
    registered_at: IsoDateTimeSchema,
})
    .strict();
export const HomeNodeStateSnapshotUpdatedSchema = z
    .object({
    home_id: z.string().min(1),
    household_id: z.string().min(1),
    snapshot: HomeStateSnapshotSchema,
    updated_at: IsoDateTimeSchema,
})
    .strict();
export const HomeNodeDisplayFeedEventSchema = z
    .object({
    household_id: z.string().min(1),
    home_id: z.string().min(1),
    home_mode: HomeModeSchema,
    updated_at: IsoDateTimeSchema,
})
    .strict();
export const HomeNodeDisplayFeedRequestSchema = z
    .object({
    surfaceId: z.string().min(1),
})
    .strict();
export const HomeNodeDisplayEventItemSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    startsAt: IsoDateTimeSchema.optional(),
})
    .strict();
export const HomeNodeDisplayChoreItemSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    dueAt: IsoDateTimeSchema.optional(),
    assignedToUserId: z.string().min(1).optional(),
})
    .strict();
export const HomeNodeDisplayShoppingItemSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1).optional(),
})
    .strict();
export const HomeNodeDisplayReminderItemSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    remindAt: IsoDateTimeSchema.optional(),
    sensitive: z.boolean().default(false),
})
    .strict();
export const HomeNodeDisplayNoticeItemSchema = z
    .object({
    id: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1).optional(),
    severity: z.enum(['info', 'warning']).default('info'),
})
    .strict();
export const HomeNodeDisplayFeedSchema = z
    .object({
    todayEvents: z.array(HomeNodeDisplayEventItemSchema),
    choresDueToday: z.array(HomeNodeDisplayChoreItemSchema),
    shoppingItems: z.array(HomeNodeDisplayShoppingItemSchema),
    topReminders: z.array(HomeNodeDisplayReminderItemSchema),
    householdNotices: z.array(HomeNodeDisplayNoticeItemSchema),
    stale: z.boolean(),
    generatedAt: IsoDateTimeSchema,
})
    .strict();
