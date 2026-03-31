CREATE TABLE IF NOT EXISTS ambient_actions (
  action_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_ref TEXT,
  decision_source TEXT NOT NULL,
  affected_user_ids_json TEXT NOT NULL,
  output_surface_id TEXT,
  result TEXT NOT NULL,
  audit_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ambient_actions_household_id ON ambient_actions(household_id);
CREATE INDEX IF NOT EXISTS idx_ambient_actions_created_at ON ambient_actions(created_at);
