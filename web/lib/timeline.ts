import type { Snapshot, SnapshotChannel, TimelineItem } from "./types";

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
