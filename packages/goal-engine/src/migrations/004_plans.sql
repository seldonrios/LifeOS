CREATE TABLE goal_engine.plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  milestone_id TEXT,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  superseded_by TEXT,
  supersedes TEXT,
  estimated_total_minutes INTEGER,
  risk_score DOUBLE PRECISION,
  expected_value DOUBLE PRECISION,
  feasibility_confidence DOUBLE PRECISION,
  scoring JSONB NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
