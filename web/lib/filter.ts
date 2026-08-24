import type { ArchiveIndex, SnapshotChannel, TimelineItem } from "./types";

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

export interface TimelineFilterSelection {
  query: string;
  selectedChannelId: string | null;
  selectedKind: TimelineKind | null;
  selectedGroup: GroupFilterValue;
}

export interface TimelineFilterStats {
  groups: GroupFilterOption[];
  groupTotalCount: number;
  vtubers: VTuberFilterOption[];
  vtuberTotalCount: number;
  kindCounts: TimelineKindCounts;
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

const emptyKindCounts = (): TimelineKindCounts => ({
  live: 0,
  upcoming: 0,
  recent: 0,
  milestone: 0,
});

function totalKindCounts(counts: TimelineKindCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function channelMatchesQuery(channel: SnapshotChannel | undefined, query: string): boolean {
  if (!query) return true;
  if (!channel) return false;
  const name = (channel.name ?? "").toLowerCase();
  const handle = (channel.handle ?? "").toLowerCase();
  return name.includes(query) || handle.includes(query);
}

function channelMatchesGroup(
  channel: SnapshotChannel | undefined,
  selectedGroup: GroupFilterValue,
): boolean {
  if (!selectedGroup) return true;
  if (!channel) return false;
  const group = channel.group?.trim() || null;
  return selectedGroup === UNGROUPED_FILTER_VALUE ? group === null : group === selectedGroup;
}

/**
 * Build faceted counts from the current timeline plus permanent archive summaries.
 * Each control applies every other active filter but excludes its own dimension, so
 * switching a type/channel/group never turns all alternative choices into zeroes.
 */
export function buildTimelineFilterStats(
  items: TimelineItem[],
  archiveIndex: ArchiveIndex | null,
  channels: Record<string, SnapshotChannel>,
  knownGroups: string[],
  selection: TimelineFilterSelection,
): TimelineFilterStats {
  const channelDirectory = new Map<string, SnapshotChannel>();
  const countsByChannel = new Map<string, TimelineKindCounts>();
  for (const item of items) {
    const channelId = timelineChannelId(item);
    channelDirectory.set(channelId, item.channel);
    const counts = countsByChannel.get(channelId) ?? emptyKindCounts();
    counts[item.kind] += 1;
    countsByChannel.set(channelId, counts);
  }
  for (const [channelId, channel] of Object.entries(channels)) {
    channelDirectory.set(channelId, channel);
  }

  if (archiveIndex?.facets === "channel") {
    const archived = new Map<string, { streams: number; milestones: number }>();
    for (const month of archiveIndex.months) {
      for (const [channelId, counts] of Object.entries(month.by_channel ?? {})) {
        const total = archived.get(channelId) ?? { streams: 0, milestones: 0 };
        total.streams += counts.streams;
        total.milestones += counts.milestones;
        archived.set(channelId, total);
      }
    }
    for (const [channelId, archiveCounts] of archived) {
      const counts = countsByChannel.get(channelId) ?? emptyKindCounts();
      // Snapshot history overlaps the current archive window; both are views of the same
      // rows, so take the larger complete count instead of adding them twice.
      counts.recent = Math.max(counts.recent, archiveCounts.streams);
      counts.milestone = Math.max(counts.milestone, archiveCounts.milestones);
      countsByChannel.set(channelId, counts);
    }
  }

  const q = selection.query.trim().toLowerCase();
  const kindCounts = emptyKindCounts();
  for (const [channelId, counts] of countsByChannel) {
    const channel = channelDirectory.get(channelId);
    if (selection.selectedChannelId && channelId !== selection.selectedChannelId) continue;
    if (!channelMatchesQuery(channel, q) || !channelMatchesGroup(channel, selection.selectedGroup)) continue;
    for (const kind of Object.keys(kindCounts) as TimelineKind[]) kindCounts[kind] += counts[kind];
  }

  const groupCounts = new Map<string, number>();
  for (const rawGroup of knownGroups) {
    const group = rawGroup.trim();
    if (group) groupCounts.set(group, 0);
  }
  groupCounts.set(UNGROUPED_FILTER_VALUE, 0);
  let groupTotalCount = 0;
  for (const [channelId, counts] of countsByChannel) {
    const channel = channelDirectory.get(channelId);
    if (!channel) continue;
    if (selection.selectedChannelId && channelId !== selection.selectedChannelId) continue;
    if (!channelMatchesQuery(channel, q)) continue;
    const count = selection.selectedKind ? counts[selection.selectedKind] : totalKindCounts(counts);
    const group = channel.group?.trim() || UNGROUPED_FILTER_VALUE;
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + count);
    groupTotalCount += count;
  }
  const groups: GroupFilterOption[] = [
    {
      value: UNGROUPED_FILTER_VALUE,
      name: "個人勢",
      itemCount: groupCounts.get(UNGROUPED_FILTER_VALUE) ?? 0,
    },
    ...[...groupCounts.entries()]
      .filter(([value]) => value !== UNGROUPED_FILTER_VALUE)
      .map(([value, itemCount]) => ({ value, name: value, itemCount }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-TW")),
  ];

  const vtubers: VTuberFilterOption[] = [];
  let vtuberTotalCount = 0;
  for (const [channelId, counts] of countsByChannel) {
    const channel = channelDirectory.get(channelId);
    if (!channel) continue;
    const matchesOtherFilters = channelMatchesQuery(channel, q) &&
      channelMatchesGroup(channel, selection.selectedGroup);
    if (!matchesOtherFilters && channelId !== selection.selectedChannelId) continue;
    const itemCount = matchesOtherFilters
      ? selection.selectedKind ? counts[selection.selectedKind] : totalKindCounts(counts)
      : 0;
    if (matchesOtherFilters) vtuberTotalCount += itemCount;
    if (itemCount === 0 && channelId !== selection.selectedChannelId) continue;
    vtubers.push({
      channelId,
      name: channel.name,
      avatar: channel.avatar,
      itemCount,
    });
  }
  vtubers.sort(
    (left, right) =>
      right.itemCount - left.itemCount || left.name.localeCompare(right.name, "zh-TW"),
  );

  return { groups, groupTotalCount, vtubers, vtuberTotalCount, kindCounts };
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
