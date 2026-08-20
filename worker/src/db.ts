import type { ChannelMeta, ChannelRow, StreamRecord, StreamStatus } from "./types";

// D1Database.batch() executes an array of prepared statements in a single
// subrequest, but an unbounded array risks hitting D1/Workers limits — cap
// each batch() call at this many statements and issue multiple round-trips.
const BATCH_CHUNK_SIZE = 100;

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

const SET_CHANNEL_META_SQL = `UPDATE channels
   SET name = ?2, avatar_url = ?3, uploads_playlist = ?4, meta_checked_at = ?5
   WHERE channel_id = ?1`;

function bindSetChannelMeta(db: D1Database, meta: ChannelMeta, checkedAt: string): D1PreparedStatement {
  return db
    .prepare(SET_CHANNEL_META_SQL)
    .bind(meta.channelId, meta.name, meta.avatarUrl, meta.uploadsPlaylist, checkedAt);
}

export async function setChannelMeta(db: D1Database, meta: ChannelMeta, checkedAt: string): Promise<void> {
  await bindSetChannelMeta(db, meta, checkedAt).run();
}

/** Same UPDATE as setChannelMeta, batched in one D1 round-trip per 100 rows. */
export async function setChannelMetasBatch(db: D1Database, metas: ChannelMeta[], checkedAt: string): Promise<void> {
  if (metas.length === 0) return;
  for (let i = 0; i < metas.length; i += BATCH_CHUNK_SIZE) {
    const chunk = metas.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk.map((m) => bindSetChannelMeta(db, m, checkedAt)));
  }
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

const UPSERT_STREAM_SQL = `INSERT INTO streams
     (video_id, channel_id, status, title, thumbnail_url, scheduled_start,
      actual_start, actual_end, concurrent_viewers, first_seen, last_checked)
   VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
   ON CONFLICT(video_id) DO UPDATE SET
     status = ?3, title = ?4, thumbnail_url = ?5, scheduled_start = ?6,
     actual_start = ?7, actual_end = ?8, concurrent_viewers = ?9, last_checked = ?10`;

function bindUpsertStream(db: D1Database, rec: StreamRecord, nowIso: string): D1PreparedStatement {
  return db
    .prepare(UPSERT_STREAM_SQL)
    .bind(
      rec.videoId, rec.channelId, rec.status, rec.title, rec.thumbnailUrl,
      rec.scheduledStart, rec.actualStart, rec.actualEnd, rec.concurrentViewers, nowIso,
    );
}

export async function upsertStream(db: D1Database, rec: StreamRecord, nowIso: string): Promise<void> {
  await bindUpsertStream(db, rec, nowIso).run();
}

/** Same upsert as upsertStream, batched in one D1 round-trip per 100 rows. */
export async function upsertStreamsBatch(db: D1Database, recs: StreamRecord[], nowIso: string): Promise<void> {
  if (recs.length === 0) return;
  for (let i = 0; i < recs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = recs.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk.map((r) => bindUpsertStream(db, r, nowIso)));
  }
}

const DELETE_STREAM_SQL = `DELETE FROM streams WHERE video_id = ?1`;

/** Remove unavailable/private videos in bounded D1 batches. */
export async function deleteStreamsBatch(db: D1Database, videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return;
  for (let i = 0; i < videoIds.length; i += BATCH_CHUNK_SIZE) {
    const chunk = videoIds.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk.map((id) => db.prepare(DELETE_STREAM_SQL).bind(id)));
  }
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
