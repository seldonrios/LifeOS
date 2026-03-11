export interface PolicyRequest {
  subject: string;
  action: string;
  resource: string;
  context: Record<string, unknown>;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  policy_id?: string;
}

export const PermissionScope = {
  health_data: 'health_data',
  calendar_write: 'calendar_write',
  calendar_read: 'calendar_read',
  device_control: 'device_control',
  external_api: 'external_api',
  economics_read: 'economics_read',
  economics_write: 'economics_write',
  production_read: 'production_read',
  production_write: 'production_write',
  presence_read: 'presence_read',
  llm_access: 'llm_access',
  life_graph_read: 'life_graph_read',
  life_graph_write: 'life_graph_write',
  event_publish: 'event_publish',
  event_subscribe: 'event_subscribe',
  notification_send: 'notification_send',
  llm_invoke: 'llm_invoke',
} as const;

export interface PolicyClient {
  evaluatePolicy(request: PolicyRequest): Promise<PolicyResult>;
  checkPermission(scope: string, context: PolicyRequest): boolean;
  /** @deprecated Use evaluatePolicy instead. */
  evaluate(request: PolicyRequest): Promise<PolicyResult>;
}
