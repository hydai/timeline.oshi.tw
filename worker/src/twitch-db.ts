import consents from "../seed/twitch-consents.json";
import type { TwitchApi, TwitchChannel, TwitchStream } from "./twitch-api";
import type { TwitchCandidate } from "./twitch-accounts";

const DAY = 86_400_000;
export interface TwitchAccount {
  channel_id: string;
  login: string;
  source_login: string;
  user_id: string | null;
  source: string;
  status: "pending" | "verified" | "conflict" | "missing" | "disabled";
  history_granted_at: string | null;
  history_revoked_at: string | null;
}

export async function twitchAccounts(db: D1Database): Promise<TwitchAccount[]> {
  return (await db.prepare("SELECT a.* FROM twitch_accounts a JOIN channels c ON c.channel_id=a.channel_id WHERE c.enabled=1 ORDER BY a.channel_id")
    .all<TwitchAccount>()).results;
}

export async function syncTwitchAccounts(db: D1Database, api: TwitchApi, candidates: TwitchCandidate[], now: string): Promise<void> {
  for (const c of candidates) {
    await db.prepare(`INSERT INTO twitch_accounts(channel_id,login,source_login,source,status) VALUES(?1,?2,?2,?3,?4)
      ON CONFLICT(channel_id) DO UPDATE SET source=excluded.source,
      status=CASE WHEN status='disabled' THEN status WHEN ?4='conflict' OR (user_id IS NULL AND login<>?2) THEN 'conflict' ELSE status END`)
      .bind(c.channelId, c.login, c.source, c.conflict ? "conflict" : "pending").run();
  }
  const accounts = await twitchAccounts(db);
  const eligible = accounts.filter(a => a.status !== "disabled" && !candidates.find(c => c.channelId === a.channel_id)?.conflict);
  // Fetch both batches completely before updating verification state. An upstream
  // failure is never interpreted as deletion of an account.
  const users = [
    ...await api.users(eligible.filter(a => !a.user_id).map(a => a.login)),
    ...await api.usersById(eligible.flatMap(a => a.user_id ? [a.user_id] : [])),
  ];
  for (const a of eligible) {
    const candidate = candidates.find(c => c.channelId === a.channel_id);
    const user = users.find(u => a.user_id ? u.id === a.user_id : u.login.toLowerCase() === a.login);
    const claimedElsewhere = user && accounts.some(other => other.channel_id !== a.channel_id && other.user_id === user.id);
    const changedSource = candidate && candidate.login !== a.login && candidate.login !== a.source_login && candidate.login !== user?.login.toLowerCase();
    if (!user || claimedElsewhere || changedSource) {
      await db.prepare("UPDATE twitch_accounts SET status=?2,checked_at=?3 WHERE channel_id=?1")
        .bind(a.channel_id, !user ? "missing" : "conflict", now).run();
      continue;
    }
    // Numeric identity survives login changes. A login resolving to a different
    // account must never inherit history or the original broadcaster's consent.
    await db.prepare("UPDATE twitch_accounts SET user_id=?2,login=?3,status='verified',checked_at=?4,source_login=?5 WHERE channel_id=?1")
      .bind(a.channel_id, user.id, user.login.toLowerCase(), now, candidate?.login ?? a.source_login).run();
    if (!a.history_granted_at && !a.history_revoked_at && consents.accounts.some(c => c.channelId === a.channel_id && c.login === a.login)) {
      await db.prepare("UPDATE twitch_accounts SET history_granted_at=?2,history_evidence=?3 WHERE channel_id=?1 AND history_revoked_at IS NULL")
        .bind(a.channel_id, consents.confirmedAt, consents.basis).run();
    }
  }
}

export async function acquireTwitchLease(db: D1Database, key: string, now: string, seconds = 120): Promise<string | null> {
  const owner = crypto.randomUUID();
  const expires = new Date(Date.parse(now) + seconds * 1000).toISOString();
  const result = await db.prepare(`INSERT INTO twitch_state(key,value,expires_at) VALUES(?1,?2,?3)
    ON CONFLICT(key) DO UPDATE SET value=?2,expires_at=?3 WHERE twitch_state.expires_at<=?4`)
    .bind(key, owner, expires, now).run();
  return result.meta.changes ? owner : null;
}

export async function releaseTwitchLease(db: D1Database, key: string, owner: string): Promise<void> {
  await db.prepare("DELETE FROM twitch_state WHERE key=?1 AND value=?2").bind(key, owner).run();
}

export async function startTwitchStream(db: D1Database, userId: string, streamId: string, start: string, observed: string): Promise<void> {
  const account = await db.prepare("SELECT * FROM twitch_accounts WHERE user_id=?1 AND status='verified'").bind(userId).first<TwitchAccount>();
  if (!account) return;
  const allowed = !!account.history_granted_at;
  // An older online notification arriving after a restart is historical; it must
  // not replace the newer active session. Mark its end as an observed upper bound.
  const newer = await db.prepare("SELECT MIN(started_at) AS started_at FROM twitch_streams WHERE user_id=?1 AND started_at>?2")
    .bind(userId, start).first<{ started_at: string | null }>();
  const offline = await db.prepare("SELECT MAX(value) AS ended_at FROM twitch_state WHERE key IN (?1,?2) AND value>=?3")
    .bind(`offline:${userId}`, `offline:${userId}:${streamId}`, start).first<{ ended_at: string | null }>();
  await db.batch([
    db.prepare(`UPDATE twitch_streams SET ended_at=?2,thumbnail_url=NULL,viewer_count=NULL
      WHERE user_id=?1 AND started_at<?2 AND ended_at IS NULL`).bind(userId, start),
    db.prepare(`INSERT INTO twitch_streams(stream_id,user_id,started_at,ended_at,observed_at,last_seen_at,expires_at,history_allowed)
      VALUES(?1,?2,?3,?4,?5,?5,?6,?7) ON CONFLICT(stream_id) DO NOTHING`)
      .bind(streamId, userId, start, newer?.started_at ?? offline?.ended_at ?? null, observed,
        allowed ? null : new Date(Date.parse(observed) + DAY).toISOString(), allowed ? 1 : 0),
  ]);
}

interface Metadata { title: string; categoryId: string; categoryName: string }
export async function updateTwitchMetadata(db: D1Database, streamId: string, value: Metadata, at: string): Promise<void> {
  // Late events can fill the historical log and earliest observation, but cannot
  // overwrite newer current metadata. Polling an unchanged title adds no entry.
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO twitch_stream_changes(stream_id,observed_at,title,category_id,category_name)
      SELECT stream_id,?2,?3,?4,?5 FROM twitch_streams
      WHERE stream_id=?1 AND started_at<=?2 AND (ended_at IS NULL OR ended_at>=?2)
        AND history_allowed=1 AND NOT EXISTS (
          SELECT 1 FROM twitch_stream_changes c WHERE c.stream_id=?1
            AND c.observed_at=(SELECT MAX(observed_at) FROM twitch_stream_changes WHERE stream_id=?1 AND observed_at<=?2)
            AND c.title=?3 AND c.category_id=?4 AND c.category_name=?5)`)
      .bind(streamId, at, value.title, value.categoryId, value.categoryName),
    db.prepare(`UPDATE twitch_streams SET title=?3,category_id=?4,category_name=?5,metadata_at=?2
      WHERE stream_id=?1 AND started_at<=?2 AND (ended_at IS NULL OR ended_at>=?2)
        AND (metadata_at IS NULL OR metadata_at<?2)`)
      .bind(streamId, at, value.title, value.categoryId, value.categoryName),
    db.prepare(`UPDATE twitch_streams SET initial_title=?3,initial_category_name=?4,initial_metadata_at=?2
      WHERE stream_id=?1 AND started_at<=?2 AND (ended_at IS NULL OR ended_at>=?2)
        AND (initial_metadata_at IS NULL OR initial_metadata_at>?2)`)
      .bind(streamId, at, value.title, value.categoryName),
    db.prepare(`INSERT OR REPLACE INTO twitch_state(key,value,expires_at)
      SELECT 'archive-rewrite',?2,'9999-12-31T00:00:00.000Z' FROM twitch_streams
      WHERE stream_id=?1 AND ended_at IS NOT NULL AND initial_metadata_at=?2`)
      .bind(streamId, at),
  ]);
}

export async function observeTwitchStream(db: D1Database, stream: TwitchStream, at: string): Promise<void> {
  const start = new Date(stream.started_at).toISOString();
  await startTwitchStream(db, stream.user_id, stream.id, start, at);
  // Get Streams is a fresh positive observation. It can correct a premature
  // offline notification for this same stream, never an older restarted stream.
  await db.prepare(`UPDATE twitch_streams SET ended_at=NULL,last_seen_at=?2,thumbnail_url=?3,viewer_count=?4
    WHERE stream_id=?1 AND last_seen_at<=?2 AND (ended_at IS NULL OR ended_at<=?2)
      AND NOT EXISTS(SELECT 1 FROM twitch_streams newer WHERE newer.user_id=twitch_streams.user_id AND newer.started_at>twitch_streams.started_at)`)
    .bind(stream.id, at, thumbnailUrl(stream.thumbnail_url), stream.viewer_count).run();
  await updateTwitchMetadata(db, stream.id, { title: stream.title, categoryId: stream.game_id, categoryName: stream.game_name }, at);
}

function thumbnailUrl(raw: string): string | null {
  try {
    const url = new URL(raw.replace("{width}", "640").replace("{height}", "360"));
    return url.protocol === "https:" && url.hostname === "static-cdn.jtvnw.net" ? url.href : null;
  } catch { return null; }
}

export async function endTwitchStream(db: D1Database, userId: string, at: string, streamId?: string): Promise<void> {
  await db.prepare(`INSERT INTO twitch_state(key,value,expires_at) VALUES(?1,?2,?3)
    ON CONFLICT(key) DO UPDATE SET value=MAX(value,excluded.value),expires_at=MAX(expires_at,excluded.expires_at)`)
    .bind(`offline:${userId}${streamId ? `:${streamId}` : ""}`, at, new Date(Date.parse(at) + DAY).toISOString()).run();
  await db.prepare(`UPDATE twitch_streams SET ended_at=?2,thumbnail_url=NULL,viewer_count=NULL
    WHERE user_id=?1 AND ended_at IS NULL AND started_at<=?2 AND last_seen_at<=?2
      AND (?3 IS NULL OR stream_id=?3)`)
    .bind(userId, at, streamId ?? null).run();
}

export async function updateTwitchChannel(db: D1Database, userId: string, value: TwitchChannel, at: string): Promise<void> {
  const row = await db.prepare(`SELECT stream_id FROM twitch_streams WHERE user_id=?1 AND started_at<=?2
    AND (ended_at IS NULL OR ended_at>=?2) ORDER BY started_at DESC LIMIT 1`)
    .bind(userId, at).first<{ stream_id: string }>();
  if (row) await updateTwitchMetadata(db, row.stream_id, { title: value.title, categoryId: value.game_id, categoryName: value.game_name }, at);
}

/** This is not a discovery backfill: grant only affects subsequent observations. */
export async function setTwitchHistoryPermission(db: D1Database, userId: string, granted: boolean, evidence: string, now: string): Promise<boolean> {
  const account = await db.prepare("SELECT 1 FROM twitch_accounts WHERE user_id=?1 AND status IN ('verified','disabled')").bind(userId).first();
  if (!account) return false;
  const statements = [db.prepare(`UPDATE twitch_accounts SET
    history_granted_at=?2,history_evidence=?3,history_revoked_at=?4,
    status=CASE WHEN ?2 IS NULL THEN 'disabled' ELSE 'verified' END
    WHERE user_id=?1 AND status IN ('verified','disabled')`)
    .bind(userId, granted ? now : null, evidence, granted ? null : now)];
  if (!granted) {
    statements.push(
      db.prepare("DELETE FROM twitch_streams WHERE user_id=?1").bind(userId),
      db.prepare("DELETE FROM twitch_inbox WHERE user_id=?1").bind(userId),
      db.prepare("INSERT OR REPLACE INTO twitch_state(key,value,expires_at) VALUES('archive-rewrite',?1,'9999-12-31T00:00:00.000Z')").bind(now),
    );
  }
  const results = await db.batch(statements);
  return !!results[0]?.meta.changes;
}

export async function pruneTwitchData(db: D1Database, now: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM twitch_streams WHERE expires_at IS NOT NULL AND expires_at<=?1").bind(now),
    // Raw webhook payloads have a short independent retention period, even for
    // broadcasters who authorized permanent, normalized stream history.
    db.prepare("DELETE FROM twitch_inbox WHERE received_at<?1")
      .bind(new Date(Date.parse(now) - DAY).toISOString()),
    db.prepare("DELETE FROM twitch_state WHERE expires_at<=?1").bind(now),
  ]);
}
