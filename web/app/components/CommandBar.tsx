"use client";

import type {
  GroupFilterOption,
  GroupFilterValue,
  TimelineKind,
  TimelineKindCounts,
  VTuberFilterOption,
} from "@/lib/filter";
import SearchBar from "./SearchBar";
import GroupFilter from "./GroupFilter";
import VTuberFilter from "./VTuberFilter";
import TimelineTypeFilter from "./TimelineTypeFilter";

/**
 * One sticky row replacing the three stacked filter blocks the page used to open with.
 * Group and channel pickers collapse into popovers so the rail starts near the top.
 */
export default function CommandBar({
  query,
  onQueryChange,
  groups,
  selectedGroup,
  onGroupSelect,
  totalCount,
  vtubers,
  selectedChannelId,
  onChannelSelect,
  groupedCount,
  kindCounts,
  selectedKind,
  onKindSelect,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  groups: GroupFilterOption[];
  selectedGroup: GroupFilterValue;
  onGroupSelect: (group: GroupFilterValue) => void;
  totalCount: number;
  vtubers: VTuberFilterOption[];
  selectedChannelId: string | null;
  onChannelSelect: (channelId: string | null) => void;
  groupedCount: number;
  kindCounts: TimelineKindCounts;
  selectedKind: TimelineKind | null;
  onKindSelect: (kind: TimelineKind | null) => void;
}) {
  return (
    <div className="glass sticky top-2 z-30 rounded-3xl p-2 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} onChange={onQueryChange} />
        <GroupFilter
          options={groups}
          selected={selectedGroup}
          totalCount={totalCount}
          onSelect={onGroupSelect}
        />
        <VTuberFilter
          options={vtubers}
          selected={selectedChannelId}
          totalCount={groupedCount}
          onSelect={onChannelSelect}
        />
        <span className="mx-1 hidden h-6 w-px flex-none bg-[var(--border-default)] xl:block" />
        <TimelineTypeFilter counts={kindCounts} selected={selectedKind} onSelect={onKindSelect} />
      </div>
    </div>
  );
}
