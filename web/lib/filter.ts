import type { TimelineItem } from "./types";

export type TimelineKind = TimelineItem["kind"];
export type TimelineKindCounts = Record<TimelineKind, number>;

export interface VTuberFilterOption {
  channelId: string;
  name: string;
  avatar: string | null;
  itemCount: number;
}

export function timelineChannelId(item: TimelineItem): string {
  return item.kind === "milestone" ? item.milestone.channelId : item.stream.channelId;
}

export function buildVTuberFilterOptions(items: TimelineItem[]): VTuberFilterOption[] {
  const options = new Map<string, VTuberFilterOption>();

  for (const item of items) {
    const channelId = timelineChannelId(item);
    const existing = options.get(channelId);
    if (existing) {
      existing.itemCount += 1;
    } else {
      options.set(channelId, {
        channelId,
        name: item.channel.name,
        avatar: item.channel.avatar,
        itemCount: 1,
      });
    }
  }

  return [...options.values()].sort(
    (left, right) =>
      right.itemCount - left.itemCount ||
      left.name.localeCompare(right.name, "zh-TW"),
  );
}

export function buildTimelineKindCounts(items: TimelineItem[]): TimelineKindCounts {
  const counts: TimelineKindCounts = {
    live: 0,
    upcoming: 0,
    recent: 0,
    milestone: 0,
  };

  for (const item of items) {
    counts[item.kind] += 1;
  }

  return counts;
}

export function filterTimeline(
  items: TimelineItem[],
  query: string,
  selectedChannelId: string | null,
  selectedKind: TimelineKind | null = null,
): TimelineItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (q) {
      const name = (it.channel.name ?? "").toLowerCase();
      const handle = (it.channel.handle ?? "").toLowerCase();
      if (!name.includes(q) && !handle.includes(q)) return false;
    }
    if (selectedChannelId && timelineChannelId(it) !== selectedChannelId) {
      return false;
    }
    if (selectedKind && it.kind !== selectedKind) return false;
    return true;
  });
}
