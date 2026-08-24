import { taipeiDayKey } from "./time";
import { UNGROUPED_FILTER_VALUE, type GroupFilterValue } from "./filter";
import type {
  ArchiveIndex, ArchiveMonthSummary, Milestone, SnapshotChannel, TimelineItem,
} from "./types";

/** The two timeline kinds that read backwards, and so are served from the archive. */
export type HistoryKind = "recent" | "milestone";

export interface ArchiveYear {
  year: string;
  total: number;
}

export interface ArchiveMonthCell {
  month: string;
  label: string;
  count: number;
}

function countOf(summary: ArchiveMonthSummary, kind: HistoryKind): number {
  return kind === "recent" ? summary.streams : summary.milestones;
}

/** Newest first, and only months that actually hold something of this kind. */
function stocked(index: ArchiveIndex, kind: HistoryKind): ArchiveMonthSummary[] {
  return index.months
    .filter((summary) => countOf(summary, kind) > 0)
    .sort((left, right) => right.month.localeCompare(left.month));
}

/**
 * Where history opens. A month can be full of streams and hold no milestones at all,
 * so the newest month overall is not necessarily one worth landing on.
 */
export function latestArchiveMonth(
  index: ArchiveIndex,
  kind: HistoryKind,
  year?: string,
): string | null {
  const months = stocked(index, kind)
    .filter((summary) => year == null || summary.month.startsWith(`${year}-`));
  return months[0]?.month ?? null;
}

/**
 * The archive only carries milestones that have already passed; the ones still coming
 * ride in on the current snapshot. Both end up on the rail, so both have to be counted
 * or a month cell contradicts what choosing it shows. `cutoff` is the archive's own
 * generated date — what it had reached when it was written.
 */
export function withPendingMilestones(
  index: ArchiveIndex,
  milestones: Milestone[],
  cutoff: string,
): ArchiveIndex {
  const pending = new Map<string, Map<string, number>>();
  for (const milestone of milestones) {
    if (milestone.date <= cutoff) continue;
    const month = milestone.date.slice(0, 7);
    const channels = pending.get(month) ?? new Map<string, number>();
    channels.set(milestone.channelId, (channels.get(milestone.channelId) ?? 0) + 1);
    pending.set(month, channels);
  }
  if (pending.size === 0) return index;

  const months = index.months.map((summary) => {
    const extraByChannel = pending.get(summary.month);
    if (!extraByChannel) return summary;
    pending.delete(summary.month);
    const byChannel = { ...(summary.by_channel ?? {}) };
    let extra = 0;
    for (const [channelId, count] of extraByChannel) {
      const current = byChannel[channelId] ?? { streams: 0, milestones: 0 };
      byChannel[channelId] = { ...current, milestones: current.milestones + count };
      extra += count;
    }
    return { ...summary, milestones: summary.milestones + extra, by_channel: byChannel };
  });
  for (const [month, extraByChannel] of pending) {
    const byChannel: NonNullable<ArchiveMonthSummary["by_channel"]> = {};
    let milestones = 0;
    for (const [channelId, count] of extraByChannel) {
      byChannel[channelId] = { streams: 0, milestones: count };
      milestones += count;
    }
    months.push({ month, streams: 0, milestones, by_channel: byChannel });
  }
  return { ...index, months: months.sort((left, right) => right.month.localeCompare(left.month)) };
}

/** Apply all channel-level filters to the archive's month totals. */
export function filterArchiveIndex(
  index: ArchiveIndex,
  channels: Record<string, SnapshotChannel>,
  query: string,
  selectedChannelId: string | null,
  selectedGroup: GroupFilterValue,
): ArchiveIndex {
  const q = query.trim().toLowerCase();
  if (!q && !selectedChannelId && !selectedGroup) return index;

  const hasCompleteFacets = index.facets === "channel";
  const months = index.months.map((summary) => {
    let streams = 0;
    let milestones = 0;
    const byChannel: NonNullable<ArchiveMonthSummary["by_channel"]> = {};

    if (hasCompleteFacets) {
      for (const [channelId, counts] of Object.entries(summary.by_channel ?? {})) {
        const channel = channels[channelId];
        if (selectedChannelId && channelId !== selectedChannelId) continue;
        if (q) {
          if (!channel) continue;
          const name = (channel.name ?? "").toLowerCase();
          const handle = (channel.handle ?? "").toLowerCase();
          if (!name.includes(q) && !handle.includes(q)) continue;
        }
        if (selectedGroup) {
          if (!channel) continue;
          const group = channel.group?.trim() || null;
          if (selectedGroup === UNGROUPED_FILTER_VALUE ? group !== null : group !== selectedGroup) {
            continue;
          }
        }
        byChannel[channelId] = counts;
        streams += counts.streams;
        milestones += counts.milestones;
      }
    }

    return { ...summary, streams, milestones, by_channel: byChannel };
  });
  return { ...index, months };
}

/** Oldest first — the year row reads left to right like a timeline. */
export function archiveYears(index: ArchiveIndex, kind: HistoryKind): ArchiveYear[] {
  const totals = new Map<string, number>();
  for (const summary of index.months) {
    const count = countOf(summary, kind);
    if (count <= 0) continue;
    const year = summary.month.slice(0, 4);
    totals.set(year, (totals.get(year) ?? 0) + count);
  }
  return [...totals.entries()]
    .map(([year, total]) => ({ year, total }))
    .sort((left, right) => left.year.localeCompare(right.year));
}

/** Twelve cells from January, always — a grid that reflows per year is unreadable. */
export function archiveYearMonths(
  index: ArchiveIndex,
  kind: HistoryKind,
  year: string,
): ArchiveMonthCell[] {
  const counts = new Map(index.months.map((summary) => [summary.month, countOf(summary, kind)]));
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month, label: `${i + 1}月`, count: counts.get(month) ?? 0 };
  });
}

/**
 * The neighbouring month worth reading: -1 goes older, 1 newer. Compared rather than
 * indexed, so a selection the archive no longer carries still steps somewhere.
 */
export function stepArchiveMonth(
  index: ArchiveIndex,
  kind: HistoryKind,
  month: string,
  direction: -1 | 1,
): string | null {
  const months = stocked(index, kind);
  return direction === -1
    ? months.find((summary) => summary.month < month)?.month ?? null
    : [...months].reverse().find((summary) => summary.month > month)?.month ?? null;
}

export function archiveTotal(index: ArchiveIndex, kind: HistoryKind): number {
  return index.months.reduce((sum, summary) => sum + countOf(summary, kind), 0);
}

/**
 * Which archive month an item belongs to. Month files hold Taipei months, so this must
 * convert the same way the worker does — otherwise a month cell's count and the rail's
 * contents disagree. Milestones are calendar dates already; only instants convert.
 */
export function itemArchiveMonth(item: TimelineItem): string | null {
  if (item.kind === "milestone") return item.milestone.date.slice(0, 7);
  if (item.kind !== "recent") return null;
  const day = item.stream.actualEnd ? taipeiDayKey(item.stream.actualEnd) : "";
  return day ? day.slice(0, 7) : null;
}

export function formatArchiveMonth(month: string): string {
  return `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;
}
