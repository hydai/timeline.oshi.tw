import type {
  ArchiveMonthSummary, ChannelMeta, ChannelRow, Milestone, StreamRecord, StreamStatus,
} from "./types";
import { TAIPEI_OFFSET_MS } from "./time";

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

export async function listChannels(db: D1Database): Promise<ChannelRow[]> {
  const { results } = await db.prepare(`SELECT * FROM channels ORDER BY channel_id`).all<ChannelRow>();
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
     actual_start = ?7, actual_end = ?8, concurrent_viewers = ?9, last_checked = ?10,
     availability = 'available', unavailable_at = NULL`;

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

const MARK_STREAM_UNAVAILABLE_SQL = `UPDATE streams
  SET availability = 'unavailable', unavailable_at = ?2, last_checked = ?2
  WHERE video_id = ?1`;

/** Hide unavailable/private videos while retaining their permanent audit row. */
export async function markStreamsUnavailableBatch(
  db: D1Database,
  videoIds: string[],
  nowIso: string,
): Promise<void> {
  if (videoIds.length === 0) return;
  for (let i = 0; i < videoIds.length; i += BATCH_CHUNK_SIZE) {
    const chunk = videoIds.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk.map((id) => db.prepare(MARK_STREAM_UNAVAILABLE_SQL).bind(id, nowIso)));
  }
}

export async function getActiveVideoIds(db: D1Database, sinceIso: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT video_id FROM streams
       WHERE availability = 'available'
         AND (status IN ('live','upcoming') OR first_seen >= ?1)`,
    )
    .bind(sinceIso)
    .all<{ video_id: string }>();
  return results.map((r) => r.video_id);
}

export async function listStreamsByStatus(db: D1Database, status: StreamStatus): Promise<StreamRecord[]> {
  const { results } = await db
    .prepare(`SELECT * FROM streams WHERE status = ?1 AND availability = 'available'`)
    .bind(status)
    .all<Record<string, unknown>>();
  return results.map(rowToStream);
}

export async function listEndedStreamsSince(db: D1Database, cutoffIso: string): Promise<StreamRecord[]> {
  const { results } = await db
    .prepare(`SELECT * FROM streams
      WHERE status = 'ended' AND availability = 'available' AND actual_end >= ?1
      ORDER BY actual_end DESC, video_id`)
    .bind(cutoffIso)
    .all<Record<string, unknown>>();
  return results.map(rowToStream);
}

const UPSERT_MILESTONE_SQL = `INSERT INTO milestones
    (channel_id, type, date, source, first_seen, last_seen)
  VALUES (?1, ?2, ?3, 'twvtuber', ?4, ?4)
  ON CONFLICT(channel_id, type, date) DO UPDATE SET last_seen = ?4`;

function bindUpsertMilestone(db: D1Database, milestone: Milestone, nowIso: string): D1PreparedStatement {
  return db
    .prepare(UPSERT_MILESTONE_SQL)
    .bind(milestone.channelId, milestone.type, milestone.date, nowIso);
}

export async function upsertMilestonesBatch(
  db: D1Database,
  milestones: Milestone[],
  nowIso: string,
): Promise<void> {
  if (milestones.length === 0) return;
  for (let i = 0; i < milestones.length; i += BATCH_CHUNK_SIZE) {
    const chunk = milestones.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(chunk.map((milestone) => bindUpsertMilestone(db, milestone, nowIso)));
  }
}

function rowToMilestone(row: Record<string, unknown>): Milestone {
  return {
    channelId: row.channel_id as string,
    type: row.type as Milestone["type"],
    date: row.date as string,
  };
}

export async function listMilestonesBetween(
  db: D1Database,
  startDate: string,
  endDate: string,
): Promise<Milestone[]> {
  const { results } = await db
    .prepare(`SELECT channel_id, type, date FROM milestones
      WHERE date >= ?1 AND date <= ?2
      ORDER BY date DESC, channel_id, type`)
    .bind(startDate, endDate)
    .all<Record<string, unknown>>();
  return results.map(rowToMilestone);
}

/**
 * Archive months are Taipei months, matching how the site groups days. Grouping by UTC
 * month filed the last eight hours of a month under the previous one, while the rail
 * headed those same streams with the next month's date.
 */
const TAIPEI_MONTH_SQL = "substr(datetime(actual_end, '+8 hours'), 1, 7)";

/** The UTC instants bounding a Taipei month, so the range stays an indexed comparison. */
function monthBounds(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`invalid archive month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error(`invalid archive month: ${month}`);
  return {
    start: new Date(Date.UTC(year, monthIndex, 1) - TAIPEI_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - TAIPEI_OFFSET_MS).toISOString(),
  };
}

export async function listEndedStreamsByMonth(
  db: D1Database,
  month: string,
  cutoffIso: string,
): Promise<StreamRecord[]> {
  const bounds = monthBounds(month);
  const { results } = await db
    .prepare(`SELECT * FROM streams
      WHERE status = 'ended' AND availability = 'available'
        AND actual_end >= ?1 AND actual_end < ?2 AND actual_end <= ?3
      ORDER BY actual_end DESC, video_id`)
    .bind(bounds.start, bounds.end, cutoffIso)
    .all<Record<string, unknown>>();
  return results.map(rowToStream);
}

export async function listMilestonesByMonth(
  db: D1Database,
  month: string,
  cutoffDate: string,
): Promise<Milestone[]> {
  monthBounds(month);
  const { results } = await db
    .prepare(`SELECT channel_id, type, date FROM milestones
      WHERE substr(date, 1, 7) = ?1 AND date <= ?2
      ORDER BY date DESC, channel_id, type`)
    .bind(month, cutoffDate)
    .all<Record<string, unknown>>();
  return results.map(rowToMilestone);
}

export async function listArchiveMonthSummaries(
  db: D1Database,
  cutoffIso: string,
): Promise<ArchiveMonthSummary[]> {
  const cutoffDate = cutoffIso.slice(0, 10);
  const { results } = await db
    .prepare(`WITH archive_rows AS (
      SELECT ${TAIPEI_MONTH_SQL} AS month, COUNT(*) AS streams, 0 AS milestones
      FROM streams
      WHERE status = 'ended' AND availability = 'available'
        AND actual_end IS NOT NULL AND actual_end <= ?1
      GROUP BY ${TAIPEI_MONTH_SQL}
      UNION ALL
      SELECT substr(date, 1, 7) AS month, 0 AS streams, COUNT(*) AS milestones
      FROM milestones
      WHERE date <= ?2
      GROUP BY substr(date, 1, 7)
    )
    SELECT month, SUM(streams) AS streams, SUM(milestones) AS milestones
    FROM archive_rows
    WHERE length(month) = 7
    GROUP BY month
    ORDER BY month DESC`)
    .bind(cutoffIso, cutoffDate)
    .all<{ month: string; streams: number; milestones: number }>();
  return results.map((row) => ({
    month: row.month,
    streams: Number(row.streams),
    milestones: Number(row.milestones),
  }));
}
