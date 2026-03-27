/**
 * @lifeos/contracts — Types for the LifeOS mobile SDK
 */

export {
  LoginRequestSchema,
  type LoginRequest,
  type AuthTokens,
  type UserProfile,
} from './auth';

export {
  type InboxItem,
  type InboxItemType,
  type ApprovalRequest,
  type ApprovalResult,
} from './inbox';

export {
  type CaptureRequest,
  type CaptureResult,
  type CaptureType,
} from './capture';

export {
  type TimelineEntry,
  type GoalSummary,
} from './timeline';

export {
  type PushTokenRegistration,
  type NotificationPayload,
  type NotificationRoute,
} from './notifications';

export type { LifeOSError } from './errors';
export type { SDKConfig } from './sdk';
