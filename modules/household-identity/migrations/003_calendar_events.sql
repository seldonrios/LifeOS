ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE events ADD COLUMN attendee_user_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE events ADD COLUMN household_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
