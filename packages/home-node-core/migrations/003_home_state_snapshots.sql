CREATE TABLE IF NOT EXISTS home_state_snapshots (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  home_mode TEXT NOT NULL,
  occupancy_summary_json TEXT NOT NULL,
  active_routines_json TEXT NOT NULL,
  adapter_health_json TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_state_snapshots_household_id ON home_state_snapshots(household_id);
