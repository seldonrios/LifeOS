CREATE TABLE approval_workflow.approval_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  action_description TEXT NOT NULL,
  approval_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  notification_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
