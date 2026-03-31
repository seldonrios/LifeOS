CREATE TABLE IF NOT EXISTS surfaces (
  surface_id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  registered_at TEXT NOT NULL,
  last_seen_at TEXT,
  FOREIGN KEY (zone_id) REFERENCES zones(zone_id) ON DELETE CASCADE,
  FOREIGN KEY (home_id) REFERENCES homes(home_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_surfaces_home_id ON surfaces(home_id);
CREATE INDEX IF NOT EXISTS idx_surfaces_zone_id ON surfaces(zone_id);
CREATE INDEX IF NOT EXISTS idx_surfaces_active ON surfaces(active);
