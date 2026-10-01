-- A Twitch account belongs to the existing canonical timeline channel. Logins
-- are aliases; verified numeric Twitch IDs are never silently reassigned.
CREATE TABLE twitch_accounts (
  channel_id TEXT PRIMARY KEY REFERENCES channels(channel_id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  source_login TEXT NOT NULL DEFAULT '',
  user_id TEXT UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','conflict','missing','disabled')),
  checked_at TEXT,
  history_granted_at TEXT,
  history_evidence TEXT,
  history_revoked_at TEXT
);

CREATE TABLE twitch_streams (
  stream_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES twitch_accounts(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  initial_title TEXT,
  initial_category_name TEXT,
  initial_metadata_at TEXT,
  thumbnail_url TEXT,
  viewer_count INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  metadata_at TEXT,
  observed_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT,
  history_allowed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_twitch_streams_user ON twitch_streams(user_id, started_at);
CREATE INDEX idx_twitch_streams_end ON twitch_streams(ended_at);

CREATE TABLE twitch_stream_changes (
  stream_id TEXT NOT NULL REFERENCES twitch_streams(stream_id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  PRIMARY KEY(stream_id, observed_at)
);

-- Persist before acknowledging EventSub. Cron retries interrupted processing.
CREATE TABLE twitch_inbox (
  message_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX idx_twitch_inbox_pending ON twitch_inbox(processed_at, sent_at);

CREATE TABLE twitch_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Presentation-only union. YouTube ingestion continues to use streams, so
-- Twitch stream IDs can never enter videos.list or YouTube tombstone handling.
CREATE VIEW timeline_streams AS
SELECT video_id, channel_id, status, title, thumbnail_url, scheduled_start,
  actual_start, actual_end, concurrent_viewers, first_seen, last_checked,
  availability, 'youtube' AS platform, video_id AS platform_stream_id,
  NULL AS category_name, NULL AS initial_title, NULL AS initial_category_name,
  NULL AS login, NULL AS expires_at
FROM streams
UNION ALL
SELECT 'twitch:' || s.stream_id, a.channel_id,
  CASE WHEN s.ended_at IS NULL THEN 'live' ELSE 'ended' END,
  CASE WHEN s.ended_at IS NULL THEN s.title ELSE COALESCE(s.initial_title, s.title) END,
  CASE WHEN s.ended_at IS NULL THEN s.thumbnail_url ELSE NULL END,
  NULL, s.started_at, s.ended_at, s.viewer_count, s.observed_at, s.last_seen_at,
  'available', 'twitch', s.stream_id,
  CASE WHEN s.ended_at IS NULL THEN s.category_name ELSE COALESCE(s.initial_category_name, s.category_name) END,
  s.initial_title, s.initial_category_name, a.login, s.expires_at
FROM twitch_streams s JOIN twitch_accounts a ON a.user_id = s.user_id
JOIN channels c ON c.channel_id = a.channel_id
WHERE a.status = 'verified' AND c.enabled = 1 AND
  (s.ended_at IS NULL OR (s.history_allowed = 1 AND a.history_granted_at IS NOT NULL));
