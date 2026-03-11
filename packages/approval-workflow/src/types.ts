export enum ApprovalMode {
  none = 'none',
  notify_only = 'notify_only',
  approve_before_schedule = 'approve_before_schedule',
  approve_before_execute = 'approve_before_execute',
}

export enum ApprovalStatus {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected',
  expired = 'expired',
  cancelled = 'cancelled',
}

export interface NotificationChannel {
  id: string;
  type: 'push' | 'email' | 'sms' | 'in_app';
  send(request: ApprovalRequest): Promise<void>;
}

export interface ApprovalRequest {
  id: string;
  task_id: string;
  requested_by: string;
  action_description: string;
  approval_mode: ApprovalMode;
  status: ApprovalStatus;
  expires_at?: string;
  notification_channels: string[];
  context?: Record<string, unknown>;
  created_at: string;
}

export interface ApprovalDecision {
  request_id: string;
  decided_by: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  notification_sent: boolean;
  decided_at: string;
}

export interface ApprovalWorkflowClient {
  requestApproval(req: ApprovalRequest): Promise<void>;
  getDecision(requestId: string): Promise<ApprovalDecision | null>;
}
