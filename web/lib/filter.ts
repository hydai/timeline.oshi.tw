import type { TimelineItem } from "./types";

export type TimelineKind = TimelineItem["kind"];
export type TimelineKindCounts = Record<TimelineKind, number>;

export const UNGROUPED_FILTER_VALUE = "__timeline_ungrouped__";
export type GroupFilterValue = string | null;

export interface GroupFilterOption {
  value: string;
  name: string;
  itemCount: number;
}

export interface VTuberFilterOption {
  channelId: string;
  name: string;
  avatar: string | null;
  itemCount: number;
}

export function timelineChannelId(item: TimelineItem): string {
  return item.kind === "milestone" ? item.milestone.channelId : item.stream.channelId;
}

export function timelineGroup(item: TimelineItem): string | null {
  const group = item.channel.group?.trim();
  return group || null;
}

export function buildGroupFilterOptions(
  items: TimelineItem[],
  knownGroups: string[] = [],
): GroupFilterOption[] {
  const counts = new Map<string, number>();

  for (const rawGroup of knownGroups) {
    const group = rawGroup.trim();
    if (group) counts.set(group, 0);
  }
  counts.set(UNGROUPED_FILTER_VALUE, 0);

  for (const item of items) {
    const group = timelineGroup(item) ?? UNGROUPED_FILTER_VALUE;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  const ungrouped: GroupFilterOption = {
    value: UNGROUPED_FILTER_VALUE,
    name: "個人勢",
    itemCount: counts.get(UNGROUPED_FILTER_VALUE) ?? 0,
  };
  const groups = [...counts.entries()]
    .filter(([value]) => value !== UNGROUPED_FILTER_VALUE)
    .map(([value, itemCount]) => ({ value, name: value, itemCount }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-TW"));

  return [ungrouped, ...groups];
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
  selectedGroup: GroupFilterValue = null,
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
    if (selectedGroup === UNGROUPED_FILTER_VALUE && timelineGroup(it) !== null) {
      return false;
    }
    if (
      selectedGroup &&
      selectedGroup !== UNGROUPED_FILTER_VALUE &&
      timelineGroup(it) !== selectedGroup
    ) {
      return false;
    }
    return true;
  });
}
