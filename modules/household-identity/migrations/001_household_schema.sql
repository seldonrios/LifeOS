CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  config_json TEXT
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  invited_by TEXT,
  joined_at TEXT,
  invite_token TEXT,
  invite_expires_at TEXT,
  PRIMARY KEY (household_id, user_id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS household_devices (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  type TEXT,
  capabilities_json TEXT,
  trust_level TEXT,
  last_seen_at TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  actor_id TEXT,
  action_type TEXT,
  object_ref TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS household_calendars (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT,
  color TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  title TEXT,
  start_at TEXT,
  end_at TEXT,
  recurrence_rule TEXT,
  reminder_at TEXT,
  FOREIGN KEY (calendar_id) REFERENCES household_calendars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chores (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT,
  recurrence_rule TEXT,
  assigned_to_json TEXT,
  rotation_policy TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chore_assignments (
  id TEXT PRIMARY KEY,
  chore_id TEXT NOT NULL,
  assigned_to TEXT,
  due_at TEXT,
  status TEXT,
  FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chore_runs (
  id TEXT PRIMARY KEY,
  chore_id TEXT NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT,
  added_by TEXT,
  status TEXT,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT,
  trigger_type TEXT,
  steps_json TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  started_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_notes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  tags_json TEXT,
  pinned INTEGER DEFAULT 0,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_household_members_household_id
  ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_household_id
  ON audit_log(household_id);
CREATE INDEX IF NOT EXISTS idx_chore_assignments_chore_id
  ON chore_assignments(chore_id);
