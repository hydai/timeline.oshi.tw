-- Tracked YouTube channels (seeded from prism registry, hololive excluded).
CREATE TABLE channels (
  channel_id       TEXT PRIMARY KEY,
  handle           TEXT,
  name             TEXT,
  avatar_url       TEXT,
  uploads_playlist TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  added_at         TEXT NOT NULL,
  meta_checked_at  TEXT
);

-- Discovered streams (live / upcoming / ended).
CREATE TABLE streams (
  video_id           TEXT PRIMARY KEY,
  channel_id         TEXT NOT NULL,
  status             TEXT NOT NULL,
  title              TEXT,
  thumbnail_url      TEXT,
  scheduled_start    TEXT,
  actual_start       TEXT,
  actual_end         TEXT,
  concurrent_viewers INTEGER,
  first_seen         TEXT NOT NULL,
  last_checked       TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_channel ON streams(channel_id);
