CREATE TABLE IF NOT EXISTS homes (
  home_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  routine_profile TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  zone_id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (home_id) REFERENCES homes(home_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_zones_home_id ON zones(home_id);
CREATE INDEX IF NOT EXISTS idx_homes_household_id ON homes(household_id);
