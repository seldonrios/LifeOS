/**
 * @lifeos/contracts
 *
 * Shared contracts for SDK/mobile surfaces and the Personal Operations hero loop.
 */

export { Topics } from '@lifeos/event-bus';

export { LoginRequestSchema, type LoginRequest, type AuthTokens, type UserProfile } from './auth';

export {
  CaptureTypeSchema,
  CaptureRequestSchema,
  CaptureStatusSchema,
  CaptureResultSchema,
  type CaptureType,
  type CaptureRequest,
  type CaptureRequestMetadata,
  type CaptureStatus,
  type CaptureResult,
} from './capture';

export {
  HouseholdRoleSchema,
  HouseholdMemberStatusSchema,
  ChoreStatusSchema,
  ShoppingItemStatusSchema,
  HouseholdCreateRequestSchema,
  HouseholdInviteMemberRequestSchema,
  HouseholdJoinRequestSchema,
  HouseholdChangeMemberRoleRequestSchema,
  HouseholdAddShoppingItemRequestSchema,
  HouseholdUpdateShoppingItemStatusRequestSchema,
  HouseholdCreateChoreRequestSchema,
  HouseholdCreateReminderRequestSchema,
  HouseholdCreateNoteRequestSchema,
  HouseholdMemberInvitedSchema,
  HouseholdMemberJoinedSchema,
  HouseholdMemberRoleChangedSchema,
  HouseholdChoreAssignedSchema,
  HouseholdChoreCompletedSchema,
  HouseholdShoppingItemAddedSchema,
  HouseholdShoppingItemPurchasedSchema,
  HouseholdCalendarEventCreatedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  HouseholdShoppingItemAddRequestedSchema,
  HouseholdChoreCreateRequestedSchema,
  HouseholdReminderCreateRequestedSchema,
  HouseholdNoteCreateRequestedSchema,
  HouseholdCaptureUnresolvedSchema,
  HouseholdHomeStateChangedSchema,
  HouseholdReminderFiredSchema,
  AuditLogEntrySchema,
  type HouseholdRole,
  type HouseholdMemberStatus,
  type ChoreStatus,
  type ShoppingItemStatus,
  type HouseholdCreateRequest,
  type HouseholdInviteMemberRequest,
  type HouseholdJoinRequest,
  type HouseholdChangeMemberRoleRequest,
  type HouseholdAddShoppingItemRequest,
  type HouseholdUpdateShoppingItemStatusRequest,
  type HouseholdCreateChoreRequest,
  type HouseholdCreateReminderRequest,
  type HouseholdCreateNoteRequest,
  type HouseholdMemberInvited,
  type HouseholdMemberJoined,
  type HouseholdMemberRoleChanged,
  type HouseholdChoreAssigned,
  type HouseholdChoreCompleted,
  type HouseholdShoppingItemAdded,
  type HouseholdShoppingItemPurchased,
  type HouseholdCalendarEventCreated,
  type HouseholdVoiceCaptureCreated,
  type HouseholdShoppingItemAddRequested,
  type HouseholdChoreCreateRequested,
  type HouseholdReminderCreateRequested,
  type HouseholdNoteCreateRequested,
  type HouseholdCaptureUnresolved,
  type HouseholdHomeStateChanged,
  type HouseholdReminderFired,
  type AuditLogEntry,
} from './household';

export {
  ApprovalRequestSchema,
  ApprovalResultSchema,
  InboxItemTypeSchema,
  ReminderInboxPayloadSchema,
  InboxItemDataSchema,
  InboxItemSchema,
  type ApprovalRequest,
  type ApprovalResult,
  type InboxItemType,
  type ReminderInboxPayload,
  type InboxItemData,
  type InboxItem,
} from './inbox';

export {
  PlanPrioritySchema,
  PlanTaskStatusSchema,
  PlanTaskSchema,
  PlanSchema,
  PlanningSuggestionSchema,
  type PlanPriority,
  type PlanTaskStatus,
  type PlanTask,
  type Plan,
  type PlanningSuggestion,
} from './plan';

export {
  ReminderStatusSchema,
  ReminderChannelSchema,
  ReminderSchema,
  type ReminderStatus,
  type ReminderChannel,
  type Reminder,
} from './reminder';

export {
  ReviewPeriodSchema,
  ReviewSourceSchema,
  ReviewLoopSummarySchema,
  ReviewPayloadSchema,
  ReviewReportSchema,
  type ReviewPeriod,
  type ReviewSource,
  type ReviewLoopSummary,
  type ReviewPayload,
  type ReviewReport,
} from './review';

export { HeroLoopEventSchema, type HeroLoopEvent } from './events';

export {
  CaptureCreateRequestSchema,
  CaptureCreateResponseSchema,
  InboxListResponseSchema,
  PlanCreateRequestSchema,
  PlanCreateResponseSchema,
  ReminderScheduleRequestSchema,
  ReminderScheduleResponseSchema,
  ReviewGenerateRequestSchema,
  ReviewGenerateResponseSchema,
  ApiErrorResponseSchema,
  type CaptureCreateRequest,
  type CaptureCreateResponse,
  type InboxListResponse,
  type PlanCreateRequest,
  type PlanCreateResponse,
  type ReminderScheduleRequest,
  type ReminderScheduleResponse,
  type ReviewGenerateRequest,
  type ReviewGenerateResponse,
  type ApiErrorResponse,
} from './api';

export {
  HeroLoopEntitySchemas,
  type HeroLoopEntitySchemaMap,
  type HeroLoopEntityName,
  type HeroLoopEntityValue,
} from './entities';

export { type TimelineEntry, type GoalSummary } from './timeline';

export {
  type PushTokenRegistration,
  type NotificationPayload,
  type NotificationRoute,
} from './notifications';

export { type DeviceInfo, type RevokeDeviceRequest } from './devices';

export {
  KnownLifeOSErrorCodeSchema,
  LifeOSErrorSchema,
  type KnownLifeOSErrorCode,
  type LifeOSError,
} from './errors';

export type { SDKConfig } from './sdk';

export * from './loop/index';
