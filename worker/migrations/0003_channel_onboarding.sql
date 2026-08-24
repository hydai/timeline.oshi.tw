-- Track automatic channel onboarding separately from the channel itself. Cron
-- delivery is at-least-once, so the durable state prevents a complete uploads
-- playlist from being scanned more than once.
CREATE TABLE channel_onboarding (
  channel_id         TEXT PRIMARY KEY,
  source             TEXT NOT NULL,
  backfill_status    TEXT NOT NULL CHECK (
    backfill_status IN ('legacy', 'pending', 'running', 'complete', 'failed', 'truncated')
  ),
  discovered_at      TEXT NOT NULL,
  backfill_attempts  INTEGER NOT NULL DEFAULT 0,
  last_backfill_at   TEXT,
  backfilled_at      TEXT,
  last_error         TEXT,
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_onboarding_pending
  ON channel_onboarding(backfill_status, discovered_at);

-- Existing production channels predate automatic onboarding. Grandfather them
-- instead of unexpectedly scanning every historical uploads playlist on deploy.
INSERT INTO channel_onboarding
  (channel_id, source, backfill_status, discovered_at)
SELECT channel_id, 'seed', 'legacy', added_at
FROM channels;
