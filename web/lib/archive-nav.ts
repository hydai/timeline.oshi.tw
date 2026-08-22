import type { ArchiveIndex, ArchiveMonthSummary, TimelineItem } from "./types";

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
 * Which archive month an item belongs to. The worker groups by `substr(iso, 1, 7)`, so
 * this slices the same way — a Taipei-month rule here would disagree with the counts
 * the index publishes.
 */
export function itemArchiveMonth(item: TimelineItem): string | null {
  if (item.kind === "milestone") return item.milestone.date.slice(0, 7);
  if (item.kind !== "recent") return null;
  return item.stream.actualEnd?.slice(0, 7) ?? null;
}

export function formatArchiveMonth(month: string): string {
  return `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;
}
