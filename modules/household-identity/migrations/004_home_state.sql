CREATE TABLE IF NOT EXISTS home_state_log (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT NOT NULL,
  source TEXT NOT NULL,
  consent_verified INTEGER NOT NULL CHECK(consent_verified IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_home_state_log_household_created ON home_state_log(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_state_log_household_state_key ON home_state_log(household_id, state_key);
CREATE INDEX IF NOT EXISTS idx_home_state_log_household_device ON home_state_log(household_id, device_id);
