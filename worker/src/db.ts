import type { ChannelMeta, ChannelRow, StreamRecord, StreamStatus } from "./types";

export async function upsertChannelId(db: D1Database, channelId: string, addedAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO channels (channel_id, enabled, added_at)
       VALUES (?1, 1, ?2)
       ON CONFLICT(channel_id) DO NOTHING`,
    )
    .bind(channelId, addedAt)
    .run();
}

export async function setChannelMeta(db: D1Database, meta: ChannelMeta, checkedAt: string): Promise<void> {
  await db
    .prepare(
      `UPDATE channels
       SET name = ?2, avatar_url = ?3, uploads_playlist = ?4, meta_checked_at = ?5
       WHERE channel_id = ?1`,
    )
    .bind(meta.channelId, meta.name, meta.avatarUrl, meta.uploadsPlaylist, checkedAt)
    .run();
}

export async function listEnabledChannels(db: D1Database): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM channels WHERE enabled = 1 ORDER BY channel_id`)
    .all<ChannelRow>();
  return results;
}

export async function getStaleChannels(db: D1Database, olderThanIso: string): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM channels
       WHERE enabled = 1 AND (meta_checked_at IS NULL OR meta_checked_at < ?1)`,
    )
    .bind(olderThanIso)
    .all<ChannelRow>();
  return results;
}

function rowToStream(r: Record<string, unknown>): StreamRecord {
  return {
    videoId: r.video_id as string,
    channelId: r.channel_id as string,
    status: r.status as StreamStatus,
    title: (r.title as string | null) ?? "",
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    scheduledStart: (r.scheduled_start as string | null) ?? null,
    actualStart: (r.actual_start as string | null) ?? null,
    actualEnd: (r.actual_end as string | null) ?? null,
    concurrentViewers: (r.concurrent_viewers as number | null) ?? null,
  };
}

export async function upsertStream(db: D1Database, rec: StreamRecord, nowIso: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO streams
         (video_id, channel_id, status, title, thumbnail_url, scheduled_start,
          actual_start, actual_end, concurrent_viewers, first_seen, last_checked)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
       ON CONFLICT(video_id) DO UPDATE SET
         status = ?3, title = ?4, thumbnail_url = ?5, scheduled_start = ?6,
         actual_start = ?7, actual_end = ?8, concurrent_viewers = ?9, last_checked = ?10`,
    )
    .bind(
      rec.videoId, rec.channelId, rec.status, rec.title, rec.thumbnailUrl,
      rec.scheduledStart, rec.actualStart, rec.actualEnd, rec.concurrentViewers, nowIso,
    )
    .run();
}

export async function getActiveVideoIds(db: D1Database, sinceIso: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT video_id FROM streams
       WHERE status IN ('live','upcoming') OR first_seen >= ?1`,
    )
    .bind(sinceIso)
    .all<{ video_id: string }>();
  return results.map((r) => r.video_id);
}

export async function listStreamsByStatus(db: D1Database, status: StreamStatus): Promise<StreamRecord[]> {
  const { results } = await db
    .prepare(`SELECT * FROM streams WHERE status = ?1`)
    .bind(status)
    .all<Record<string, unknown>>();
  return results.map(rowToStream);
}

export async function pruneEndedBefore(db: D1Database, cutoffIso: string): Promise<void> {
  await db
    .prepare(`DELETE FROM streams WHERE status = 'ended' AND (actual_end IS NULL OR actual_end < ?1)`)
    .bind(cutoffIso)
    .run();
}
