import type {
  ChannelRow, Milestone, RosterEntry, Snapshot, SnapshotChannel, SnapshotStream, StreamRecord,
} from "./types";

export interface BuildSnapshotInput {
  channels: ChannelRow[];
  streams: StreamRecord[];
  roster: Map<string, RosterEntry>;
  milestones: Milestone[];
  nowIso: string;
  heavyRefreshedAtIso: string;
}

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function toSnapshotChannel(row: ChannelRow, r: RosterEntry | undefined): SnapshotChannel {
  return {
    name: row.name ?? r?.name ?? row.channel_id,
    handle: row.handle,
    avatar: row.avatar_url ?? r?.avatar ?? null,
    group: r?.group ?? null,
    nationality: r?.nationality ?? null,
    youtube_subs: r?.youtubeSubs ?? null,
    twvtuber_id: r?.twvtuberId ?? null,
  };
}

export function toSnapshotStream(s: StreamRecord): SnapshotStream {
  const base: SnapshotStream = {
    ...(s.platform === "twitch" ? {
      platform: s.platform, platformStreamId: s.platformStreamId,
      categoryName: s.categoryName, initialTitle: s.initialTitle,
      initialCategoryName: s.initialCategoryName, channelUrl: s.channelUrl,
      ...(s.estimatedEnd ? { estimatedEnd: s.estimatedEnd } : {}),
      ...(s.expiresAt ? { expiresAt: s.expiresAt } : {}),
    } : {}),
    videoId: s.videoId,
    channelId: s.channelId,
    title: s.title,
    thumbnail: s.thumbnailUrl,
    url: s.platform === "twitch" ? s.status === "live" ? s.channelUrl ?? null : null : `https://www.youtube.com/watch?v=${s.videoId}`,
  };
  if (s.actualStart != null) base.actualStart = s.actualStart;
  if (s.scheduledStart != null) base.scheduledStart = s.scheduledStart;
  if (s.actualEnd != null) base.actualEnd = s.actualEnd;
  if (s.concurrentViewers != null) base.concurrentViewers = s.concurrentViewers;
  return base;
}

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const { channels, streams, roster, milestones, nowIso, heavyRefreshedAtIso } = input;
  const now = new Date(nowIso).getTime();

  const channelMap: Record<string, SnapshotChannel> = {};
  const groups = new Set<string>();
  for (const row of channels) {
    const r = roster.get(row.channel_id);
    channelMap[row.channel_id] = toSnapshotChannel(row, r);
    if (r?.group) groups.add(r.group);
  }

  const tracked = streams.filter((s) => channelMap[s.channelId] !== undefined);

  const live = tracked
    .filter((s) => s.status === "live")
    .sort((a, b) => (b.actualStart ?? "").localeCompare(a.actualStart ?? ""))
    .map(toSnapshotStream);

  const upcoming = tracked
    .filter((s) => s.status === "upcoming")
    .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""))
    .map(toSnapshotStream);

  const recent = tracked
    .filter((s) => s.status === "ended" && (s.actualEnd ?? s.estimatedEnd) != null && now - new Date((s.actualEnd ?? s.estimatedEnd)!).getTime() <= RECENT_WINDOW_MS)
    .sort((a, b) => (b.actualEnd ?? b.estimatedEnd ?? "").localeCompare(a.actualEnd ?? a.estimatedEnd ?? ""))
    .map(toSnapshotStream);

  return {
    version: "1.0.0",
    generated_at: nowIso,
    heavy_refreshed_at: heavyRefreshedAtIso,
    channels: channelMap,
    groups: [...groups].sort(),
    live,
    upcoming,
    recent,
    milestones,
  };
}
