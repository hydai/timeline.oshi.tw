import type { ChannelMeta, Env, Milestone, RosterEntry, Snapshot, StreamRecord } from "./types";
import type { TwVtuber } from "./twvtuber";
import {
  getActiveVideoIds, getStaleChannels, listEnabledChannels, listEndedStreamsSince,
  listMilestonesBetween, listStreamsByStatus, markStreamsUnavailableBatch, setChannelMetasBatch,
  upsertMilestonesBatch, upsertStreamsBatch,
} from "./db";
import { derivePermanentMilestones, indexRosterByYoutubeId } from "./twvtuber";
import { buildSnapshot } from "./snapshot";
import { readSnapshot, writeSnapshot } from "./r2";
import { publishArchive } from "./archive";

const DAY = 24 * 60 * 60 * 1000;

export interface RefreshDeps {
  fetchRecentVideoIds: (channelId: string) => Promise<string[]>;
  fetchVideoDetails: (ids: string[]) => Promise<StreamRecord[]>;
  fetchChannelMeta: (ids: string[]) => Promise<ChannelMeta[]>;
  fetchRoster: () => Promise<TwVtuber[]>;
  now: () => string;
}

async function collectCurrentStreams(db: D1Database, nowMs: number): Promise<StreamRecord[]> {
  const [live, upcoming, ended] = await Promise.all([
    listStreamsByStatus(db, "live"),
    listStreamsByStatus(db, "upcoming"),
    listEndedStreamsSince(db, new Date(nowMs - 7 * DAY).toISOString()),
  ]);
  return [...live, ...upcoming, ...ended];
}

async function reconcileFetchedStreams(
  db: D1Database,
  requestedIds: string[],
  details: StreamRecord[],
  trackedChannelIds: Set<string>,
  nowIso: string,
): Promise<void> {
  // A successful videos.list response omits private/deleted videos. This
  // function is reached only after the complete API request succeeds, so a
  // transport/API failure cannot be mistaken for an unavailable video.
  const returnedIds = new Set(details.map((stream) => stream.videoId));
  const missingIds = requestedIds.filter((id) => !returnedIds.has(id));
  const tracked = details.filter((stream) => trackedChannelIds.has(stream.channelId));

  await upsertStreamsBatch(db, tracked, nowIso);
  await markStreamsUnavailableBatch(db, missingIds, nowIso);

  if (missingIds.length > 0) {
    console.warn(JSON.stringify({
      message: "tombstoned streams unavailable from YouTube videos.list",
      count: missingIds.length,
      videoIds: missingIds,
    }));
  }
}

async function listSnapshotMilestones(db: D1Database, nowMs: number): Promise<Milestone[]> {
  const start = new Date(nowMs - 7 * DAY).toISOString().slice(0, 10);
  const end = new Date(nowMs + 31 * DAY).toISOString().slice(0, 10);
  return listMilestonesBetween(db, start, end);
}

export async function heavyRefresh(env: Env, deps: RefreshDeps): Promise<Snapshot> {
  const nowIso = deps.now();
  const nowMs = new Date(nowIso).getTime();
  const channels = await listEnabledChannels(env.DB);
  const trackedIds = new Set(channels.map((c) => c.channel_id));

  // 1. Discover candidates: known-active (last 24h) + RSS per channel (0 quota).
  const candidates = new Set<string>(await getActiveVideoIds(env.DB, new Date(nowMs - DAY).toISOString()));
  for (const c of channels) {
    try {
      for (const id of await deps.fetchRecentVideoIds(c.channel_id)) candidates.add(id);
    } catch (e) {
      console.warn(`RSS failed for ${c.channel_id}: ${(e as Error).message}`);
    }
  }

  // 2. Confirm status via videos.list; upsert those on tracked channels.
  if (candidates.size > 0) {
    const requestedIds = [...candidates];
    const details = await deps.fetchVideoDetails(requestedIds);
    await reconcileFetchedStreams(env.DB, requestedIds, details, trackedIds, nowIso);
  }

  // 3. Refresh stale channel metadata (name/avatar/uploads) — tolerant: it's
  // enrichment only, so a channels.list failure must not discard the stream
  // upserts done above (design §10).
  const stale = await getStaleChannels(env.DB, new Date(nowMs - 7 * DAY).toISOString());
  if (stale.length > 0) {
    try {
      const metas = await deps.fetchChannelMeta(stale.map((c) => c.channel_id));
      await setChannelMetasBatch(env.DB, metas, nowIso);
    } catch (e) {
      console.warn(`channel meta refresh failed: ${(e as Error).message}`);
    }
  }

  // 4. The full twvtuber roster supplies enrichment and permanent milestones.
  // A transient failure leaves all previously stored milestone rows untouched.
  let roster: Map<string, RosterEntry> = new Map();
  try {
    const vtubers = await deps.fetchRoster();
    roster = indexRosterByYoutubeId(vtubers);
    await upsertMilestonesBatch(
      env.DB,
      derivePermanentMilestones(vtubers, trackedIds, nowIso),
      nowIso,
    );
  } catch (e) {
    console.warn(`roster failed: ${(e as Error).message}`);
  }

  // 5. Publish a lightweight current snapshot plus the permanent monthly archive.
  const rows = await listEnabledChannels(env.DB);
  const streams = await collectCurrentStreams(env.DB, nowMs);
  const milestones = await listSnapshotMilestones(env.DB, nowMs);
  const snapshot = buildSnapshot({ channels: rows, streams, roster, milestones, nowIso, heavyRefreshedAtIso: nowIso });
  await writeSnapshot(env.DATA_PUBLIC, snapshot);
  await publishArchive(env.DB, env.DATA_PUBLIC, roster, nowIso);
  return snapshot;
}

export async function lightRefresh(env: Env, deps: RefreshDeps): Promise<Snapshot | null> {
  const last = await readSnapshot(env.DATA_PUBLIC);
  if (!last) return null; // first run must be heavy

  const nowIso = deps.now();
  const nowMs = new Date(nowIso).getTime();

  // Re-check only known-active video ids (cheap; no RSS, no twvtuber).
  const activeIds = await getActiveVideoIds(env.DB, new Date(nowMs - DAY).toISOString());
  if (activeIds.length > 0) {
    const trackedIds = new Set((await listEnabledChannels(env.DB)).map((c) => c.channel_id));
    const details = await deps.fetchVideoDetails(activeIds);
    await reconcileFetchedStreams(env.DB, activeIds, details, trackedIds, nowIso);
  }
  // Reconstruct roster/heavy-time from the last heavy snapshot.
  const roster: Map<string, RosterEntry> = new Map();
  for (const [cid, c] of Object.entries(last.channels)) {
    if (c.twvtuber_id == null) continue; // no twvtuber match — leave unmapped, exactly like heavyRefresh
    roster.set(cid, {
      youtubeId: cid,
      name: c.name,
      group: c.group,
      nationality: c.nationality,
      youtubeSubs: c.youtube_subs,
      avatar: c.avatar,
      twvtuberId: c.twvtuber_id,
    });
  }
  const rows = await listEnabledChannels(env.DB);
  const streams = await collectCurrentStreams(env.DB, nowMs);
  const milestones = await listSnapshotMilestones(env.DB, nowMs);
  const snapshot = buildSnapshot({
    channels: rows, streams, roster, milestones,
    nowIso, heavyRefreshedAtIso: last.heavy_refreshed_at,
  });
  await writeSnapshot(env.DATA_PUBLIC, snapshot);
  await publishArchive(env.DB, env.DATA_PUBLIC, roster, nowIso);
  return snapshot;
}

export { collectCurrentStreams, readSnapshot, DAY };
