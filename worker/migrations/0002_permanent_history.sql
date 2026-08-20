-- Keep every discovered stream permanently. Unavailable/private videos are
-- tombstoned so they disappear from public views without erasing history.
ALTER TABLE streams ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
ALTER TABLE streams ADD COLUMN unavailable_at TEXT;

CREATE INDEX idx_streams_archive
  ON streams(status, availability, actual_end);

-- Milestones are derived from the full roster and accumulated permanently.
CREATE TABLE milestones (
  channel_id TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('debut', 'anniversary', 'graduate')),
  date       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'twvtuber',
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  PRIMARY KEY (channel_id, type, date),
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

CREATE INDEX idx_milestones_date ON milestones(date);
