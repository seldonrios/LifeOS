import { z } from 'zod';

import { IsoDateTimeSchema } from './loop/shared';

export const HouseholdRoleSchema = z.enum(['Admin', 'Adult', 'Teen', 'Child', 'Guest']);
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;

export const HouseholdMemberStatusSchema = z.enum(['active', 'invited', 'suspended']);
export type HouseholdMemberStatus = z.infer<typeof HouseholdMemberStatusSchema>;

export const ChoreStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
export type ChoreStatus = z.infer<typeof ChoreStatusSchema>;

export const ShoppingItemStatusSchema = z.enum(['added', 'in_cart', 'purchased']);
export type ShoppingItemStatus = z.infer<typeof ShoppingItemStatusSchema>;

export const HouseholdCreateRequestSchema = z.object({
  name: z.string().min(1),
});
export type HouseholdCreateRequest = z.infer<typeof HouseholdCreateRequestSchema>;

export const HouseholdInviteMemberRequestSchema = z.object({
  invitedUserId: z.string().min(1),
  role: HouseholdRoleSchema,
});
export type HouseholdInviteMemberRequest = z.infer<typeof HouseholdInviteMemberRequestSchema>;

export const HouseholdJoinRequestSchema = z.object({
  inviteToken: z.string().min(1),
});
export type HouseholdJoinRequest = z.infer<typeof HouseholdJoinRequestSchema>;

export const HouseholdChangeMemberRoleRequestSchema = z.object({
  role: HouseholdRoleSchema,
});
export type HouseholdChangeMemberRoleRequest = z.infer<
  typeof HouseholdChangeMemberRoleRequestSchema
>;

export const HouseholdAddShoppingItemRequestSchema = z.object({
  listId: z.string().min(1).optional(),
  title: z.string().min(1),
  source: z.enum(['manual', 'voice', 'routine']),
});
export type HouseholdAddShoppingItemRequest = z.infer<typeof HouseholdAddShoppingItemRequestSchema>;

export const HouseholdUpdateShoppingItemStatusRequestSchema = z.object({
  status: ShoppingItemStatusSchema,
});
export type HouseholdUpdateShoppingItemStatusRequest = z.infer<
  typeof HouseholdUpdateShoppingItemStatusRequestSchema
>;

export const HouseholdCreateChoreRequestSchema = z.object({
  title: z.string().min(1),
  assignedToUserId: z.string().min(1),
  dueAt: IsoDateTimeSchema,
  recurrenceRule: z.string().optional(),
});
export type HouseholdCreateChoreRequest = z.infer<typeof HouseholdCreateChoreRequestSchema>;

export const HouseholdCreateReminderRequestSchema = z.object({
  objectType: z.string().min(1),
  objectId: z.string().min(1),
  targetUserIds: z.array(z.string().min(1)),
  remindAt: IsoDateTimeSchema,
});
export type HouseholdCreateReminderRequest = z.infer<typeof HouseholdCreateReminderRequestSchema>;

export const HouseholdCreateNoteRequestSchema = z.object({
  body: z.string().min(1),
});
export type HouseholdCreateNoteRequest = z.infer<typeof HouseholdCreateNoteRequestSchema>;

export const HouseholdMemberInvitedSchema = z.object({
  householdId: z.string().min(1),
  invitedUserId: z.string().min(1),
  role: HouseholdRoleSchema,
  inviteToken: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
});
export type HouseholdMemberInvited = z.infer<typeof HouseholdMemberInvitedSchema>;

export const HouseholdMemberJoinedSchema = z.object({
  householdId: z.string().min(1),
  userId: z.string().min(1),
  role: HouseholdRoleSchema,
  joinedAt: IsoDateTimeSchema,
});
export type HouseholdMemberJoined = z.infer<typeof HouseholdMemberJoinedSchema>;

export const HouseholdMemberRoleChangedSchema = z.object({
  householdId: z.string().min(1),
  userId: z.string().min(1),
  previousRole: HouseholdRoleSchema,
  newRole: HouseholdRoleSchema,
});
export type HouseholdMemberRoleChanged = z.infer<typeof HouseholdMemberRoleChangedSchema>;

export const HouseholdChoreAssignedSchema = z.object({
  householdId: z.string().min(1),
  choreId: z.string().min(1),
  choreTitle: z.string().min(1),
  assignedToUserId: z.string().min(1),
  dueAt: IsoDateTimeSchema,
  recurrenceRule: z.string().optional(),
});
export type HouseholdChoreAssigned = z.infer<typeof HouseholdChoreAssignedSchema>;

export const HouseholdChoreCompletedSchema = z.object({
  householdId: z.string().min(1),
  choreId: z.string().min(1),
  choreTitle: z.string().min(1),
  completedByUserId: z.string().min(1),
  completedAt: IsoDateTimeSchema,
  streakCount: z.number().int().nonnegative(),
});
export type HouseholdChoreCompleted = z.infer<typeof HouseholdChoreCompletedSchema>;

export const HouseholdShoppingItemAddedSchema = z.object({
  householdId: z.string().min(1),
  listId: z.string().min(1),
  itemId: z.string().min(1),
  title: z.string().min(1),
  addedByUserId: z.string().min(1),
  source: z.enum(['manual', 'voice', 'routine']),
});
export type HouseholdShoppingItemAdded = z.infer<typeof HouseholdShoppingItemAddedSchema>;

export const HouseholdShoppingItemPurchasedSchema = z.object({
  householdId: z.string().min(1),
  listId: z.string().min(1),
  itemId: z.string().min(1),
  title: z.string().min(1),
  purchasedByUserId: z.string().min(1),
  purchasedAt: IsoDateTimeSchema,
});
export type HouseholdShoppingItemPurchased = z.infer<typeof HouseholdShoppingItemPurchasedSchema>;

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
export type HouseholdCalendarEventCreated = z.infer<typeof HouseholdCalendarEventCreatedSchema>;

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
export type HouseholdVoiceCaptureCreated = z.infer<typeof HouseholdVoiceCaptureCreatedSchema>;

export const HouseholdShoppingItemAddRequestedSchema = z.object({
  householdId: z.string().min(1),
  actorUserId: z.string().min(1),
  originalCaptureId: z.string().min(1),
  text: z.string().min(1),
  itemTitle: z.string().min(1),
});
export type HouseholdShoppingItemAddRequested = z.infer<
  typeof HouseholdShoppingItemAddRequestedSchema
>;

export const HouseholdChoreCreateRequestedSchema = z.object({
  householdId: z.string().min(1),
  actorUserId: z.string().min(1),
  originalCaptureId: z.string().min(1),
  text: z.string().min(1),
  choreTitle: z.string().min(1),
});
export type HouseholdChoreCreateRequested = z.infer<typeof HouseholdChoreCreateRequestedSchema>;

export const HouseholdReminderCreateRequestedSchema = z.object({
  householdId: z.string().min(1),
  actorUserId: z.string().min(1),
  originalCaptureId: z.string().min(1),
  text: z.string().min(1),
  reminderText: z.string().min(1),
});
export type HouseholdReminderCreateRequested = z.infer<
  typeof HouseholdReminderCreateRequestedSchema
>;

export const HouseholdNoteCreateRequestedSchema = z.object({
  householdId: z.string().min(1),
  actorUserId: z.string().min(1),
  originalCaptureId: z.string().min(1),
  text: z.string().min(1),
  noteBody: z.string().min(1),
});
export type HouseholdNoteCreateRequested = z.infer<typeof HouseholdNoteCreateRequestedSchema>;

export const HouseholdCaptureUnresolvedSchema = z.object({
  captureId: z.string().min(1),
  householdId: z.string().min(1),
  text: z.string().min(1),
  reason: z.string().min(1),
});
export type HouseholdCaptureUnresolved = z.infer<typeof HouseholdCaptureUnresolvedSchema>;

export const HouseholdCaptureStatusSchema = z.enum(['pending', 'resolved', 'unresolved']);
export type HouseholdCaptureStatus = z.infer<typeof HouseholdCaptureStatusSchema>;

export const HouseholdCaptureStatusResponseSchema = z.object({
  status: HouseholdCaptureStatusSchema,
  resolvedAction: z.string().min(1).optional(),
  objectId: z.string().min(1).optional(),
});
export type HouseholdCaptureStatusResponse = z.infer<typeof HouseholdCaptureStatusResponseSchema>;

export const HouseholdHomeStateChangedSchema = z.object({
  householdId: z.string().min(1),
  deviceId: z.string().min(1),
  stateKey: z.string().min(1),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  source: z.enum(['ha_bridge', 'manual', 'routine']),
  consentVerified: z.boolean(),
});
export type HouseholdHomeStateChanged = z.infer<typeof HouseholdHomeStateChangedSchema>;

export const HouseholdHomeStateConfigSchema = z.object({
  haIntegrationEnabled: z.boolean().optional(),
  haConsentedStateKeys: z.array(z.string().min(1)).optional(),
});
export type HouseholdHomeStateConfig = z.infer<typeof HouseholdHomeStateConfigSchema>;

export const HouseholdUpdateConfigRequestSchema = z
  .object({
    haIntegrationEnabled: z.boolean().optional(),
    haConsentedStateKeys: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) => value.haIntegrationEnabled !== undefined || value.haConsentedStateKeys !== undefined,
    {
      message: 'At least one config field is required',
    },
  );
export type HouseholdUpdateConfigRequest = z.infer<typeof HouseholdUpdateConfigRequestSchema>;

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
export type HouseholdHaWebhookRequest = z.infer<typeof HouseholdHaWebhookRequestSchema>;

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
export type HomeStateChange = z.infer<typeof HomeStateChangeSchema>;

export const HouseholdContextSummarySchema = z.object({
  membersHome: z.array(z.string().min(1)),
  activeDevices: z.array(z.string().min(1)),
  recentStateChanges: z.array(HomeStateChangeSchema),
});
export type HouseholdContextSummary = z.infer<typeof HouseholdContextSummarySchema>;

export const HouseholdReminderFiredSchema = z.object({
  householdId: z.string().min(1),
  reminderId: z.string().min(1),
  objectType: z.enum(['chore', 'event', 'shopping', 'routine', 'custom']),
  objectId: z.string().min(1),
  targetUserIds: z.array(z.string().min(1)),
  firedAt: IsoDateTimeSchema,
  deliveryStatus: z.enum(['delivered', 'failed', 'quiet_hours_suppressed']),
});
export type HouseholdReminderFired = z.infer<typeof HouseholdReminderFiredSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  actorId: z.string().min(1),
  actionType: z.string().min(1),
  objectRef: z.string().min(1),
  payloadJson: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTimeSchema,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
