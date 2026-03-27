/**
 * Inbox-related types for the LifeOS mobile SDK.
 */

export type InboxItemType = 'approval' | 'notification' | 'reminder';

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  description?: string;
  createdAt: number;
  read: boolean;
  data: ApprovalRequest | Record<string, unknown>;
}

export interface ApprovalRequest {
  requestId: string;
  action: string;
  context: Record<string, unknown>;
  deadline?: number;
}

export interface ApprovalResult {
  requestId: string;
  approved: boolean;
  reason?: string;
  timestamp: number;
}
