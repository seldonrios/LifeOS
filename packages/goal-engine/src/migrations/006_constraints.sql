CREATE TABLE goal_engine.constraints (
  id TEXT PRIMARY KEY,
  goal_id TEXT,
  plan_id TEXT,
  task_id TEXT,
  type TEXT NOT NULL,
  hard BOOLEAN NOT NULL,
  condition TEXT NOT NULL,
  violation_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
