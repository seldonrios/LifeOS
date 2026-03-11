CREATE TABLE goal_engine.replan_requests (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  affected_goal_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_plan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
