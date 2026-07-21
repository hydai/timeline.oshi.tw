import type { ChannelMeta, ChannelRow } from "./types";

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
