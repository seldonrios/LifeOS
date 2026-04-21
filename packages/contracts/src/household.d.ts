import { z } from 'zod';
export declare const HouseholdRoleSchema: z.ZodEnum<{
    Admin: "Admin";
    Adult: "Adult";
    Teen: "Teen";
    Child: "Child";
    Guest: "Guest";
}>;
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;
export declare const HouseholdMemberStatusSchema: z.ZodEnum<{
    active: "active";
    invited: "invited";
    suspended: "suspended";
}>;
export type HouseholdMemberStatus = z.infer<typeof HouseholdMemberStatusSchema>;
export declare const ChoreStatusSchema: z.ZodEnum<{
    pending: "pending";
    in_progress: "in_progress";
    completed: "completed";
    skipped: "skipped";
}>;
export type ChoreStatus = z.infer<typeof ChoreStatusSchema>;
export declare const ShoppingItemStatusSchema: z.ZodEnum<{
    added: "added";
    in_cart: "in_cart";
    purchased: "purchased";
}>;
export type ShoppingItemStatus = z.infer<typeof ShoppingItemStatusSchema>;
export declare const HouseholdCreateRequestSchema: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>;
export type HouseholdCreateRequest = z.infer<typeof HouseholdCreateRequestSchema>;
export declare const HouseholdInviteMemberRequestSchema: z.ZodObject<{
    invitedUserId: z.ZodString;
    role: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
}, z.core.$strip>;
export type HouseholdInviteMemberRequest = z.infer<typeof HouseholdInviteMemberRequestSchema>;
export declare const HouseholdJoinRequestSchema: z.ZodObject<{
    inviteToken: z.ZodString;
}, z.core.$strip>;
export type HouseholdJoinRequest = z.infer<typeof HouseholdJoinRequestSchema>;
export declare const HouseholdChangeMemberRoleRequestSchema: z.ZodObject<{
    role: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
}, z.core.$strip>;
export type HouseholdChangeMemberRoleRequest = z.infer<typeof HouseholdChangeMemberRoleRequestSchema>;
export declare const HouseholdAddShoppingItemRequestSchema: z.ZodObject<{
    listId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    source: z.ZodEnum<{
        voice: "voice";
        manual: "manual";
        routine: "routine";
    }>;
}, z.core.$strip>;
export type HouseholdAddShoppingItemRequest = z.infer<typeof HouseholdAddShoppingItemRequestSchema>;
export declare const HouseholdUpdateShoppingItemStatusRequestSchema: z.ZodObject<{
    status: z.ZodEnum<{
        added: "added";
        in_cart: "in_cart";
        purchased: "purchased";
    }>;
}, z.core.$strip>;
export type HouseholdUpdateShoppingItemStatusRequest = z.infer<typeof HouseholdUpdateShoppingItemStatusRequestSchema>;
export declare const HouseholdCreateChoreRequestSchema: z.ZodObject<{
    title: z.ZodString;
    assignedToUserId: z.ZodString;
    dueAt: z.ZodString;
    recurrenceRule: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HouseholdCreateChoreRequest = z.infer<typeof HouseholdCreateChoreRequestSchema>;
export declare const HouseholdCreateReminderRequestSchema: z.ZodObject<{
    objectType: z.ZodString;
    objectId: z.ZodString;
    targetUserIds: z.ZodArray<z.ZodString>;
    remindAt: z.ZodString;
}, z.core.$strip>;
export type HouseholdCreateReminderRequest = z.infer<typeof HouseholdCreateReminderRequestSchema>;
export declare const HouseholdCreateNoteRequestSchema: z.ZodObject<{
    body: z.ZodString;
}, z.core.$strip>;
export type HouseholdCreateNoteRequest = z.infer<typeof HouseholdCreateNoteRequestSchema>;
export declare const HouseholdMemberInvitedSchema: z.ZodObject<{
    householdId: z.ZodString;
    invitedUserId: z.ZodString;
    role: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
    inviteToken: z.ZodString;
    expiresAt: z.ZodString;
}, z.core.$strip>;
export type HouseholdMemberInvited = z.infer<typeof HouseholdMemberInvitedSchema>;
export declare const HouseholdMemberJoinedSchema: z.ZodObject<{
    householdId: z.ZodString;
    userId: z.ZodString;
    role: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
    joinedAt: z.ZodString;
}, z.core.$strip>;
export type HouseholdMemberJoined = z.infer<typeof HouseholdMemberJoinedSchema>;
export declare const HouseholdMemberRoleChangedSchema: z.ZodObject<{
    householdId: z.ZodString;
    userId: z.ZodString;
    previousRole: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
    newRole: z.ZodEnum<{
        Admin: "Admin";
        Adult: "Adult";
        Teen: "Teen";
        Child: "Child";
        Guest: "Guest";
    }>;
}, z.core.$strip>;
export type HouseholdMemberRoleChanged = z.infer<typeof HouseholdMemberRoleChangedSchema>;
export declare const HouseholdChoreAssignedSchema: z.ZodObject<{
    householdId: z.ZodString;
    choreId: z.ZodString;
    choreTitle: z.ZodString;
    assignedToUserId: z.ZodString;
    dueAt: z.ZodString;
    recurrenceRule: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HouseholdChoreAssigned = z.infer<typeof HouseholdChoreAssignedSchema>;
export declare const HouseholdChoreCompletedSchema: z.ZodObject<{
    householdId: z.ZodString;
    choreId: z.ZodString;
    choreTitle: z.ZodString;
    completedByUserId: z.ZodString;
    completedAt: z.ZodString;
    streakCount: z.ZodNumber;
}, z.core.$strip>;
export type HouseholdChoreCompleted = z.infer<typeof HouseholdChoreCompletedSchema>;
export declare const HouseholdShoppingItemAddedSchema: z.ZodObject<{
    householdId: z.ZodString;
    listId: z.ZodString;
    itemId: z.ZodString;
    title: z.ZodString;
    addedByUserId: z.ZodString;
    source: z.ZodEnum<{
        voice: "voice";
        manual: "manual";
        routine: "routine";
    }>;
}, z.core.$strip>;
export type HouseholdShoppingItemAdded = z.infer<typeof HouseholdShoppingItemAddedSchema>;
export declare const HouseholdShoppingItemPurchasedSchema: z.ZodObject<{
    householdId: z.ZodString;
    listId: z.ZodString;
    itemId: z.ZodString;
    title: z.ZodString;
    purchasedByUserId: z.ZodString;
    purchasedAt: z.ZodString;
}, z.core.$strip>;
export type HouseholdShoppingItemPurchased = z.infer<typeof HouseholdShoppingItemPurchasedSchema>;
export declare const HouseholdCalendarEventCreatedSchema: z.ZodObject<{
    householdId: z.ZodString;
    calendarId: z.ZodString;
    eventId: z.ZodString;
    title: z.ZodString;
    startAt: z.ZodString;
    endAt: z.ZodString;
    recurrenceRule: z.ZodOptional<z.ZodString>;
    reminderAt: z.ZodOptional<z.ZodString>;
    attendeeUserIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type HouseholdCalendarEventCreated = z.infer<typeof HouseholdCalendarEventCreatedSchema>;
export declare const HouseholdVoiceCaptureCreatedSchema: z.ZodObject<{
    captureId: z.ZodString;
    householdId: z.ZodString;
    actorUserId: z.ZodString;
    text: z.ZodString;
    audioRef: z.ZodNullable<z.ZodString>;
    source: z.ZodEnum<{
        mobile: "mobile";
        ha_satellite: "ha_satellite";
        ha_bridge: "ha_bridge";
    }>;
    sourceDeviceId: z.ZodOptional<z.ZodString>;
    targetHint: z.ZodOptional<z.ZodEnum<{
        shopping: "shopping";
        chore: "chore";
        reminder: "reminder";
        note: "note";
        unknown: "unknown";
    }>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type HouseholdVoiceCaptureCreated = z.infer<typeof HouseholdVoiceCaptureCreatedSchema>;
export declare const HomeNodeVoiceSessionStartedSchema: z.ZodObject<{
    session_id: z.ZodString;
    household_id: z.ZodString;
    surface_id: z.ZodString;
    started_at: z.ZodString;
}, z.core.$strip>;
export type HomeNodeVoiceSessionStarted = z.infer<typeof HomeNodeVoiceSessionStartedSchema>;
export declare const HomeNodeVoiceSessionCompletedSchema: z.ZodObject<{
    session_id: z.ZodString;
    household_id: z.ZodString;
    surface_id: z.ZodString;
    capture_id: z.ZodString;
    transcript: z.ZodString;
    target_hint: z.ZodOptional<z.ZodEnum<{
        shopping: "shopping";
        chore: "chore";
        reminder: "reminder";
        note: "note";
        unknown: "unknown";
    }>>;
    completed_at: z.ZodString;
}, z.core.$strip>;
export type HomeNodeVoiceSessionCompleted = z.infer<typeof HomeNodeVoiceSessionCompletedSchema>;
export declare const HomeNodeVoiceSessionFailedSchema: z.ZodObject<{
    session_id: z.ZodString;
    household_id: z.ZodString;
    surface_id: z.ZodString;
    reason: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
    failed_at: z.ZodString;
}, z.core.$strip>;
export type HomeNodeVoiceSessionFailed = z.infer<typeof HomeNodeVoiceSessionFailedSchema>;
export declare const HouseholdShoppingItemAddRequestedSchema: z.ZodObject<{
    householdId: z.ZodString;
    actorUserId: z.ZodString;
    originalCaptureId: z.ZodString;
    text: z.ZodString;
    itemTitle: z.ZodString;
}, z.core.$strip>;
export type HouseholdShoppingItemAddRequested = z.infer<typeof HouseholdShoppingItemAddRequestedSchema>;
export declare const HouseholdChoreCreateRequestedSchema: z.ZodObject<{
    householdId: z.ZodString;
    actorUserId: z.ZodString;
    originalCaptureId: z.ZodString;
    text: z.ZodString;
    choreTitle: z.ZodString;
}, z.core.$strip>;
export type HouseholdChoreCreateRequested = z.infer<typeof HouseholdChoreCreateRequestedSchema>;
export declare const HouseholdReminderCreateRequestedSchema: z.ZodObject<{
    householdId: z.ZodString;
    actorUserId: z.ZodString;
    originalCaptureId: z.ZodString;
    text: z.ZodString;
    reminderText: z.ZodString;
}, z.core.$strip>;
export type HouseholdReminderCreateRequested = z.infer<typeof HouseholdReminderCreateRequestedSchema>;
export declare const HouseholdNoteCreateRequestedSchema: z.ZodObject<{
    householdId: z.ZodString;
    actorUserId: z.ZodString;
    originalCaptureId: z.ZodString;
    text: z.ZodString;
    noteBody: z.ZodString;
}, z.core.$strip>;
export type HouseholdNoteCreateRequested = z.infer<typeof HouseholdNoteCreateRequestedSchema>;
export declare const HouseholdCaptureUnresolvedSchema: z.ZodObject<{
    captureId: z.ZodString;
    householdId: z.ZodString;
    text: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>;
export type HouseholdCaptureUnresolved = z.infer<typeof HouseholdCaptureUnresolvedSchema>;
export declare const HouseholdAutomationFailedSchema: z.ZodObject<{
    household_id: z.ZodString;
    actor_id: z.ZodString;
    action_type: z.ZodString;
    error_code: z.ZodString;
    fix_suggestion: z.ZodString;
    span_id: z.ZodString;
    trace_id: z.ZodOptional<z.ZodString>;
    object_id: z.ZodOptional<z.ZodString>;
    object_ref: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type HouseholdAutomationFailed = z.infer<typeof HouseholdAutomationFailedSchema>;
export declare const HouseholdCaptureStatusSchema: z.ZodEnum<{
    pending: "pending";
    resolved: "resolved";
    unresolved: "unresolved";
}>;
export type HouseholdCaptureStatus = z.infer<typeof HouseholdCaptureStatusSchema>;
export declare const HouseholdCaptureStatusResponseSchema: z.ZodObject<{
    status: z.ZodEnum<{
        pending: "pending";
        resolved: "resolved";
        unresolved: "unresolved";
    }>;
    resolvedAction: z.ZodOptional<z.ZodString>;
    objectId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HouseholdCaptureStatusResponse = z.infer<typeof HouseholdCaptureStatusResponseSchema>;
export declare const HouseholdHomeStateChangedSchema: z.ZodObject<{
    householdId: z.ZodString;
    deviceId: z.ZodString;
    stateKey: z.ZodString;
    previousValue: z.ZodUnknown;
    newValue: z.ZodUnknown;
    source: z.ZodEnum<{
        ha_bridge: "ha_bridge";
        manual: "manual";
        routine: "routine";
    }>;
    consentVerified: z.ZodBoolean;
}, z.core.$strip>;
export type HouseholdHomeStateChanged = z.infer<typeof HouseholdHomeStateChangedSchema>;
export declare const HouseholdHomeStateConfigSchema: z.ZodObject<{
    haIntegrationEnabled: z.ZodOptional<z.ZodBoolean>;
    haConsentedStateKeys: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timeZone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HouseholdHomeStateConfig = z.infer<typeof HouseholdHomeStateConfigSchema>;
export declare const HouseholdUpdateConfigRequestSchema: z.ZodObject<{
    haIntegrationEnabled: z.ZodOptional<z.ZodBoolean>;
    haConsentedStateKeys: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timeZone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HouseholdUpdateConfigRequest = z.infer<typeof HouseholdUpdateConfigRequestSchema>;
export declare const HouseholdHaWebhookRequestSchema: z.ZodPipe<z.ZodObject<{
    deviceId: z.ZodString;
    stateKey: z.ZodString;
    previousValue: z.ZodOptional<z.ZodUnknown>;
    newValue: z.ZodUnknown;
    voice_transcript: z.ZodOptional<z.ZodString>;
    voiceTranscript: z.ZodOptional<z.ZodString>;
    sourceDeviceId: z.ZodOptional<z.ZodString>;
    actorUserId: z.ZodOptional<z.ZodString>;
    targetHint: z.ZodOptional<z.ZodEnum<{
        shopping: "shopping";
        chore: "chore";
        reminder: "reminder";
        note: "note";
        unknown: "unknown";
    }>>;
}, z.core.$strip>, z.ZodTransform<{
    voice_transcript: string | undefined;
    deviceId: string;
    stateKey: string;
    newValue: unknown;
    previousValue?: unknown;
    sourceDeviceId?: string | undefined;
    actorUserId?: string | undefined;
    targetHint?: "shopping" | "chore" | "reminder" | "note" | "unknown" | undefined;
}, {
    deviceId: string;
    stateKey: string;
    newValue: unknown;
    previousValue?: unknown;
    voice_transcript?: string | undefined;
    voiceTranscript?: string | undefined;
    sourceDeviceId?: string | undefined;
    actorUserId?: string | undefined;
    targetHint?: "shopping" | "chore" | "reminder" | "note" | "unknown" | undefined;
}>>;
export type HouseholdHaWebhookRequest = z.infer<typeof HouseholdHaWebhookRequestSchema>;
export declare const HomeStateChangeSchema: z.ZodObject<{
    id: z.ZodString;
    deviceId: z.ZodString;
    stateKey: z.ZodString;
    previousValue: z.ZodUnknown;
    newValue: z.ZodUnknown;
    source: z.ZodEnum<{
        ha_bridge: "ha_bridge";
        manual: "manual";
        routine: "routine";
    }>;
    consentVerified: z.ZodBoolean;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type HomeStateChange = z.infer<typeof HomeStateChangeSchema>;
export declare const HouseholdContextSummarySchema: z.ZodObject<{
    membersHome: z.ZodArray<z.ZodString>;
    activeDevices: z.ZodArray<z.ZodString>;
    recentStateChanges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        deviceId: z.ZodString;
        stateKey: z.ZodString;
        previousValue: z.ZodUnknown;
        newValue: z.ZodUnknown;
        source: z.ZodEnum<{
            ha_bridge: "ha_bridge";
            manual: "manual";
            routine: "routine";
        }>;
        consentVerified: z.ZodBoolean;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type HouseholdContextSummary = z.infer<typeof HouseholdContextSummarySchema>;
export declare const HouseholdReminderFiredSchema: z.ZodObject<{
    householdId: z.ZodString;
    reminderId: z.ZodString;
    objectType: z.ZodEnum<{
        shopping: "shopping";
        chore: "chore";
        custom: "custom";
        routine: "routine";
        event: "event";
    }>;
    objectId: z.ZodString;
    targetUserIds: z.ZodArray<z.ZodString>;
    firedAt: z.ZodString;
    deliveryStatus: z.ZodEnum<{
        failed: "failed";
        delivered: "delivered";
        quiet_hours_suppressed: "quiet_hours_suppressed";
    }>;
}, z.core.$strip>;
export type HouseholdReminderFired = z.infer<typeof HouseholdReminderFiredSchema>;
export declare const AuditLogEntrySchema: z.ZodObject<{
    id: z.ZodString;
    householdId: z.ZodString;
    actorId: z.ZodString;
    actionType: z.ZodString;
    objectRef: z.ZodString;
    payloadJson: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export declare const SurfaceKindSchema: z.ZodEnum<{
    kitchen_display: "kitchen_display";
    hallway_display: "hallway_display";
    living_room_display: "living_room_display";
    desk_display: "desk_display";
    voice_endpoint: "voice_endpoint";
    mobile_app: "mobile_app";
}>;
export type SurfaceKind = z.infer<typeof SurfaceKindSchema>;
export declare const SurfaceTrustLevelSchema: z.ZodEnum<{
    household: "household";
    personal: "personal";
    guest: "guest";
}>;
export type SurfaceTrustLevel = z.infer<typeof SurfaceTrustLevelSchema>;
export declare const SurfaceCapabilitySchema: z.ZodEnum<{
    read: "read";
    "quick-action": "quick-action";
    "full-action": "full-action";
    "voice-capture": "voice-capture";
    "voice-confirm": "voice-confirm";
}>;
export type SurfaceCapability = z.infer<typeof SurfaceCapabilitySchema>;
export declare const HomeNodeSurfaceSchema: z.ZodObject<{
    surface_id: z.ZodString;
    zone_id: z.ZodString;
    kind: z.ZodEnum<{
        kitchen_display: "kitchen_display";
        hallway_display: "hallway_display";
        living_room_display: "living_room_display";
        desk_display: "desk_display";
        voice_endpoint: "voice_endpoint";
        mobile_app: "mobile_app";
    }>;
    trust_level: z.ZodEnum<{
        household: "household";
        personal: "personal";
        guest: "guest";
    }>;
    capabilities: z.ZodArray<z.ZodEnum<{
        read: "read";
        "quick-action": "quick-action";
        "full-action": "full-action";
        "voice-capture": "voice-capture";
        "voice-confirm": "voice-confirm";
    }>>;
    active: z.ZodBoolean;
    registered_at: z.ZodString;
}, z.core.$strict>;
export type HomeNodeSurface = z.infer<typeof HomeNodeSurfaceSchema>;
export declare const HomeNodeZoneTypeSchema: z.ZodEnum<{
    kitchen: "kitchen";
    hallway: "hallway";
    bedroom: "bedroom";
    office: "office";
    entryway: "entryway";
    living_room: "living_room";
    other: "other";
}>;
export type HomeNodeZoneType = z.infer<typeof HomeNodeZoneTypeSchema>;
export declare const HomeNodeZoneSchema: z.ZodObject<{
    zone_id: z.ZodString;
    home_id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<{
        kitchen: "kitchen";
        hallway: "hallway";
        bedroom: "bedroom";
        office: "office";
        entryway: "entryway";
        living_room: "living_room";
        other: "other";
    }>;
}, z.core.$strict>;
export type HomeNodeZone = z.infer<typeof HomeNodeZoneSchema>;
export declare const HomeNodeHomeSchema: z.ZodObject<{
    home_id: z.ZodString;
    household_id: z.ZodString;
    name: z.ZodString;
    timezone: z.ZodString;
    quiet_hours_start: z.ZodOptional<z.ZodString>;
    quiet_hours_end: z.ZodOptional<z.ZodString>;
    routine_profile: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type HomeNodeHome = z.infer<typeof HomeNodeHomeSchema>;
export declare const HomeModeSchema: z.ZodEnum<{
    home: "home";
    away: "away";
    sleep: "sleep";
    quiet_hours: "quiet_hours";
    morning_routine: "morning_routine";
    evening_routine: "evening_routine";
    guest_mode: "guest_mode";
    vacation_mode: "vacation_mode";
}>;
export type HomeMode = z.infer<typeof HomeModeSchema>;
export declare const HomeStateSnapshotSchema: z.ZodObject<{
    home_mode: z.ZodEnum<{
        home: "home";
        away: "away";
        sleep: "sleep";
        quiet_hours: "quiet_hours";
        morning_routine: "morning_routine";
        evening_routine: "evening_routine";
        guest_mode: "guest_mode";
        vacation_mode: "vacation_mode";
    }>;
    occupancy_summary: z.ZodString;
    active_routines: z.ZodArray<z.ZodString>;
    adapter_health: z.ZodEnum<{
        healthy: "healthy";
        degraded: "degraded";
        unavailable: "unavailable";
    }>;
    snapshot_at: z.ZodString;
}, z.core.$strict>;
export type HomeStateSnapshot = z.infer<typeof HomeStateSnapshotSchema>;
export declare const HomeNodeSurfaceRegisteredSchema: z.ZodObject<{
    surface_id: z.ZodString;
    zone_id: z.ZodString;
    home_id: z.ZodString;
    household_id: z.ZodString;
    kind: z.ZodEnum<{
        kitchen_display: "kitchen_display";
        hallway_display: "hallway_display";
        living_room_display: "living_room_display";
        desk_display: "desk_display";
        voice_endpoint: "voice_endpoint";
        mobile_app: "mobile_app";
    }>;
    trust_level: z.ZodEnum<{
        household: "household";
        personal: "personal";
        guest: "guest";
    }>;
    capabilities: z.ZodArray<z.ZodEnum<{
        read: "read";
        "quick-action": "quick-action";
        "full-action": "full-action";
        "voice-capture": "voice-capture";
        "voice-confirm": "voice-confirm";
    }>>;
    registered_at: z.ZodString;
}, z.core.$strict>;
export type HomeNodeSurfaceRegistered = z.infer<typeof HomeNodeSurfaceRegisteredSchema>;
export declare const HomeNodeStateSnapshotUpdatedSchema: z.ZodObject<{
    home_id: z.ZodString;
    household_id: z.ZodString;
    snapshot: z.ZodObject<{
        home_mode: z.ZodEnum<{
            home: "home";
            away: "away";
            sleep: "sleep";
            quiet_hours: "quiet_hours";
            morning_routine: "morning_routine";
            evening_routine: "evening_routine";
            guest_mode: "guest_mode";
            vacation_mode: "vacation_mode";
        }>;
        occupancy_summary: z.ZodString;
        active_routines: z.ZodArray<z.ZodString>;
        adapter_health: z.ZodEnum<{
            healthy: "healthy";
            degraded: "degraded";
            unavailable: "unavailable";
        }>;
        snapshot_at: z.ZodString;
    }, z.core.$strict>;
    updated_at: z.ZodString;
}, z.core.$strict>;
export type HomeNodeStateSnapshotUpdated = z.infer<typeof HomeNodeStateSnapshotUpdatedSchema>;
export declare const HomeNodeDisplayFeedEventSchema: z.ZodObject<{
    household_id: z.ZodString;
    home_id: z.ZodString;
    home_mode: z.ZodEnum<{
        home: "home";
        away: "away";
        sleep: "sleep";
        quiet_hours: "quiet_hours";
        morning_routine: "morning_routine";
        evening_routine: "evening_routine";
        guest_mode: "guest_mode";
        vacation_mode: "vacation_mode";
    }>;
    updated_at: z.ZodString;
}, z.core.$strict>;
export type HomeNodeDisplayFeedEvent = z.infer<typeof HomeNodeDisplayFeedEventSchema>;
export declare const HomeNodeDisplayFeedRequestSchema: z.ZodObject<{
    surfaceId: z.ZodString;
}, z.core.$strict>;
export type HomeNodeDisplayFeedRequest = z.infer<typeof HomeNodeDisplayFeedRequestSchema>;
export declare const HomeNodeDisplayEventItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    startsAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type HomeNodeDisplayEventItem = z.infer<typeof HomeNodeDisplayEventItemSchema>;
export declare const HomeNodeDisplayChoreItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    dueAt: z.ZodOptional<z.ZodString>;
    assignedToUserId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type HomeNodeDisplayChoreItem = z.infer<typeof HomeNodeDisplayChoreItemSchema>;
export declare const HomeNodeDisplayShoppingItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type HomeNodeDisplayShoppingItem = z.infer<typeof HomeNodeDisplayShoppingItemSchema>;
export declare const HomeNodeDisplayReminderItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    remindAt: z.ZodOptional<z.ZodString>;
    sensitive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export type HomeNodeDisplayReminderItem = z.infer<typeof HomeNodeDisplayReminderItemSchema>;
export declare const HomeNodeDisplayNoticeItemSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    severity: z.ZodDefault<z.ZodEnum<{
        info: "info";
        warning: "warning";
    }>>;
}, z.core.$strict>;
export type HomeNodeDisplayNoticeItem = z.infer<typeof HomeNodeDisplayNoticeItemSchema>;
export declare const HomeNodeDisplayFeedSchema: z.ZodObject<{
    todayEvents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        startsAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    choresDueToday: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        dueAt: z.ZodOptional<z.ZodString>;
        assignedToUserId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    shoppingItems: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    topReminders: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        remindAt: z.ZodOptional<z.ZodString>;
        sensitive: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    householdNotices: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        message: z.ZodOptional<z.ZodString>;
        severity: z.ZodDefault<z.ZodEnum<{
            info: "info";
            warning: "warning";
        }>>;
    }, z.core.$strict>>;
    stale: z.ZodBoolean;
    generatedAt: z.ZodString;
}, z.core.$strict>;
export type HomeNodeDisplayFeed = z.infer<typeof HomeNodeDisplayFeedSchema>;
//# sourceMappingURL=household.d.ts.map