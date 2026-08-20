import type { ArchiveMonth, Snapshot, SnapshotChannel, TimelineItem } from "./types";

function ms(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function buildTimeline(snap: Snapshot): TimelineItem[] {
  const ch = (id: string): SnapshotChannel | undefined => snap.channels[id];

  const live: TimelineItem[] = snap.live
    .filter((s) => ch(s.channelId))
    .map((s) => ({ kind: "live" as const, sortAt: ms(s.actualStart), stream: s, channel: ch(s.channelId)! }))
    .sort((a, b) => (b.stream.concurrentViewers ?? 0) - (a.stream.concurrentViewers ?? 0));

  const upcoming: TimelineItem[] = snap.upcoming
    .filter((s) => ch(s.channelId))
    .map((s) => ({ kind: "upcoming" as const, sortAt: ms(s.scheduledStart), stream: s, channel: ch(s.channelId)! }))
    .sort((a, b) => (a.sortAt || Number.MAX_SAFE_INTEGER) - (b.sortAt || Number.MAX_SAFE_INTEGER));

  const past: TimelineItem[] = [
    ...snap.recent
      .filter((s) => ch(s.channelId))
      .map((s) => ({ kind: "recent" as const, sortAt: ms(s.actualEnd), stream: s, channel: ch(s.channelId)! })),
    ...snap.milestones
      .filter((m) => ch(m.channelId))
      .map((m) => ({ kind: "milestone" as const, sortAt: ms(m.date), milestone: m, channel: ch(m.channelId)! })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  return [...live, ...upcoming, ...past];
}

export function buildArchiveTimeline(months: ArchiveMonth[]): TimelineItem[] {
  return months.flatMap((month) => {
    const ch = (id: string): SnapshotChannel | undefined => month.channels[id];
    return [
      ...month.streams
        .filter((stream) => ch(stream.channelId))
        .map((stream) => ({
          kind: "recent" as const,
          sortAt: ms(stream.actualEnd),
          stream,
          channel: ch(stream.channelId)!,
        })),
      ...month.milestones
        .filter((milestone) => ch(milestone.channelId))
        .map((milestone) => ({
          kind: "milestone" as const,
          sortAt: ms(milestone.date),
          milestone,
          channel: ch(milestone.channelId)!,
        })),
    ];
  }).sort((left, right) => right.sortAt - left.sortAt);
}

export function timelineItemKey(item: TimelineItem): string {
  return item.kind === "milestone"
    ? `milestone:${item.milestone.channelId}:${item.milestone.type}:${item.milestone.date}`
    : `stream:${item.stream.videoId}`;
}

/** Merge current and lazy-loaded archive data without duplicating the overlap window. */
export function mergeTimelines(...timelines: TimelineItem[][]): TimelineItem[] {
  const unique = new Map<string, TimelineItem>();
  for (const item of timelines.flat()) {
    if (!unique.has(timelineItemKey(item))) unique.set(timelineItemKey(item), item);
  }
  const items = [...unique.values()];
  const live = items
    .filter((item): item is Extract<TimelineItem, { kind: "live" }> => item.kind === "live")
    .sort((left, right) => (right.stream.concurrentViewers ?? 0) - (left.stream.concurrentViewers ?? 0));
  const upcoming = items
    .filter((item): item is Extract<TimelineItem, { kind: "upcoming" }> => item.kind === "upcoming")
    .sort((left, right) =>
      (left.sortAt || Number.MAX_SAFE_INTEGER) - (right.sortAt || Number.MAX_SAFE_INTEGER),
    );
  const history = items
    .filter((item) => item.kind === "recent" || item.kind === "milestone")
    .sort((left, right) => right.sortAt - left.sortAt);
  return [...live, ...upcoming, ...history];
}
