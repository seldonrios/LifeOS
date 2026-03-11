CREATE TABLE goal_engine.milestones (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  milestone_status TEXT NOT NULL,
  target_date TIMESTAMPTZ NOT NULL,
  success_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
