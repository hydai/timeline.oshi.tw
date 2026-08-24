import type { ChannelMeta, Env, Milestone, RosterEntry, Snapshot, StreamRecord } from "./types";
import type { TwVtuber } from "./twvtuber";
import {
  getActiveVideoIds, getStaleChannels, listEnabledChannels, listEndedStreamsSince,
  listMilestonesBetween, listStreamsByStatus, markStreamsUnavailableBatch, setChannelMetasBatch,
  unseenVideoIds, upsertMilestonesBatch, upsertStreamsBatch,
} from "./db";
import { applyPrismGroups, indexPrismGroups, readPrismStreamers, type PrismStreamer } from "./prism";
import { derivePermanentMilestones, indexRosterByYoutubeId } from "./twvtuber";
import { buildSnapshot } from "./snapshot";
import { readSnapshot, writeSnapshot } from "./r2";
import { publishArchive } from "./archive";
import { processNextOnboarding, registerOnboardingCandidates, timelineOnboardingCandidates } from "./onboarding";

const DAY = 24 * 60 * 60 * 1000;

export interface RefreshDeps {
  fetchRecentVideoIds: (channelId: string) => Promise<string[]>;
  fetchUploadIds: (playlistId: string) => Promise<{ ids: string[]; truncated: boolean }>;
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

/**
 * Every channel's recent uploads, read from the RSS feeds at no YouTube quota. One
 * channel's feed failing must not cost us the rest of the round.
 */
async function feedVideoIds(deps: RefreshDeps, channelIds: string[]): Promise<string[]> {
  const ids = new Set<string>();
  for (const channelId of channelIds) {
    try {
      for (const id of await deps.fetchRecentVideoIds(channelId)) ids.add(id);
    } catch (e) {
      console.warn(`RSS failed for ${channelId}: ${(e as Error).message}`);
    }
  }
  return [...ids];
}

async function listSnapshotMilestones(db: D1Database, nowMs: number): Promise<Milestone[]> {
  const start = new Date(nowMs - 7 * DAY).toISOString().slice(0, 10);
  const end = new Date(nowMs + 31 * DAY).toISOString().slice(0, 10);
  return listMilestonesBetween(db, start, end);
}

export async function heavyRefresh(env: Env, deps: RefreshDeps): Promise<Snapshot> {
  const nowIso = deps.now();
  const nowMs = new Date(nowIso).getTime();

  // 0. Data's VOD directory is the live tracking authority. Register additions before
  // reading enabled channels so the rest of this same heavy pass can enrich, discover,
  // backfill and publish them. Missing/malformed data never removes existing channels.
  let prismStreamers: PrismStreamer[] = [];
  try {
    prismStreamers = await readPrismStreamers(env.DATA_PUBLIC);
    const registered = await registerOnboardingCandidates(
      env.DB,
      timelineOnboardingCandidates(prismStreamers),
      nowIso,
    );
    if (registered.length > 0) {
      console.log(JSON.stringify({
        message: "registered timeline channels from data VOD directory",
        count: registered.length,
        channelIds: registered,
      }));
    }
  } catch (e) {
    console.error(JSON.stringify({
      message: "channel onboarding discovery failed",
      error: e instanceof Error ? e.message : String(e),
    }));
  }

  const channels = await listEnabledChannels(env.DB);
  const trackedIds = new Set(channels.map((c) => c.channel_id));

  // 1. Discover candidates: everything that can still change, plus every id the feeds
  // list. Heavy re-reads the feeds in full, which is also how an edited title or a
  // replaced thumbnail on an already-finished stream gets picked up.
  const candidates = new Set<string>(await getActiveVideoIds(env.DB, new Date(nowMs - DAY).toISOString()));
  for (const id of await feedVideoIds(deps, channels.map((c) => c.channel_id))) candidates.add(id);

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

  // Prism is the authority on affiliation — twvtuber files 春魚創意 under the brand
  // "SquareLive", and still lists 銀河 Galaxy under 靛堂 after it went solo. Prism wins
  // for every channel it carries; a prism outage leaves the roster untouched.
  roster = applyPrismGroups(roster, indexPrismGroups(prismStreamers));

  // Only one whole-channel history scan runs per heavy pass. D1 keeps the durable
  // pending/running/completed state, so failures retry and duplicate cron delivery is safe.
  await processNextOnboarding(env, {
    fetchUploadIds: deps.fetchUploadIds,
    fetchVideoDetails: deps.fetchVideoDetails,
    now: () => nowIso,
  }, nowIso);

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

  // Re-check what can still change, and chase anything the feeds show that no record
  // covers — a stream that went up since the last pass. Feed entries we already hold are
  // left out: they are either in the active set already or finished for good, so this
  // stays roughly one videos.list call however often it runs. No twvtuber, no channel meta.
  const channels = await listEnabledChannels(env.DB);
  const candidates = new Set<string>(await getActiveVideoIds(env.DB, new Date(nowMs - DAY).toISOString()));
  const fresh = await unseenVideoIds(env.DB, await feedVideoIds(deps, channels.map((c) => c.channel_id)));
  for (const id of fresh) candidates.add(id);

  if (candidates.size > 0) {
    const requestedIds = [...candidates];
    const trackedIds = new Set(channels.map((c) => c.channel_id));
    const details = await deps.fetchVideoDetails(requestedIds);
    await reconcileFetchedStreams(env.DB, requestedIds, details, trackedIds, nowIso);
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
  const streams = await collectCurrentStreams(env.DB, nowMs);
  const milestones = await listSnapshotMilestones(env.DB, nowMs);
  const snapshot = buildSnapshot({
    channels, streams, roster, milestones,
    nowIso, heavyRefreshedAtIso: last.heavy_refreshed_at,
  });
  await writeSnapshot(env.DATA_PUBLIC, snapshot);
  await publishArchive(env.DB, env.DATA_PUBLIC, roster, nowIso, "current-month");
  return snapshot;
}

export { collectCurrentStreams, readSnapshot, DAY };
