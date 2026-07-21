import type { ChannelMeta, Env, Milestone, RosterEntry, Snapshot, StreamRecord } from "./types";
import type { TwVtuber } from "./twvtuber";
import {
  getActiveVideoIds, getStaleChannels, listEnabledChannels, listStreamsByStatus,
  pruneEndedBefore, setChannelMetasBatch, upsertStreamsBatch,
} from "./db";
import { indexRosterByYoutubeId } from "./twvtuber";
import { buildSnapshot } from "./snapshot";
import { readSnapshot, writeSnapshot } from "./r2";

const DAY = 24 * 60 * 60 * 1000;

export interface RefreshDeps {
  fetchRecentVideoIds: (channelId: string) => Promise<string[]>;
  fetchVideoDetails: (ids: string[]) => Promise<StreamRecord[]>;
  fetchChannelMeta: (ids: string[]) => Promise<ChannelMeta[]>;
  fetchRoster: () => Promise<TwVtuber[]>;
  fetchMilestones: (trackedIds: Set<string>, nowIso: string) => Promise<Milestone[]>;
  now: () => string;
}

async function collectAllStreams(db: D1Database): Promise<StreamRecord[]> {
  const [live, upcoming, ended] = await Promise.all([
    listStreamsByStatus(db, "live"),
    listStreamsByStatus(db, "upcoming"),
    listStreamsByStatus(db, "ended"),
  ]);
  return [...live, ...upcoming, ...ended];
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
    const details = await deps.fetchVideoDetails([...candidates]);
    const tracked = details.filter((s) => trackedIds.has(s.channelId));
    await upsertStreamsBatch(env.DB, tracked, nowIso);
  }

  // 3. Prune ended older than 7 days.
  await pruneEndedBefore(env.DB, new Date(nowMs - 7 * DAY).toISOString());

  // 4. Refresh stale channel metadata (name/avatar/uploads) — tolerant: it's
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

  // 5. twvtuber join — tolerant (design §10): roster AND milestones may fail
  // (rate-limit/network) without sinking the cycle.
  let roster: Map<string, RosterEntry> = new Map();
  try {
    roster = indexRosterByYoutubeId(await deps.fetchRoster());
  } catch (e) {
    console.warn(`roster failed: ${(e as Error).message}`);
  }
  let milestones: Milestone[] = [];
  try {
    milestones = await deps.fetchMilestones(trackedIds, nowIso);
  } catch (e) {
    console.warn(`milestones failed: ${(e as Error).message}`);
  }

  // 6. Build + publish.
  const rows = await listEnabledChannels(env.DB);
  const streams = await collectAllStreams(env.DB);
  const snapshot = buildSnapshot({ channels: rows, streams, roster, milestones, nowIso, heavyRefreshedAtIso: nowIso });
  await writeSnapshot(env.DATA_PUBLIC, snapshot);
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
    const tracked = details.filter((s) => trackedIds.has(s.channelId));
    await upsertStreamsBatch(env.DB, tracked, nowIso);
  }
  await pruneEndedBefore(env.DB, new Date(nowMs - 7 * DAY).toISOString());

  // Reconstruct roster/milestones/heavy-time from the last heavy snapshot.
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
  const streams = await collectAllStreams(env.DB);
  const snapshot = buildSnapshot({
    channels: rows, streams, roster, milestones: last.milestones,
    nowIso, heavyRefreshedAtIso: last.heavy_refreshed_at,
  });
  await writeSnapshot(env.DATA_PUBLIC, snapshot);
  return snapshot;
}

export { collectAllStreams, readSnapshot, DAY };
