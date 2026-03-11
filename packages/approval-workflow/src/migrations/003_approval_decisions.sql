CREATE TABLE approval_workflow.approval_decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at TIMESTAMPTZ NOT NULL
);
