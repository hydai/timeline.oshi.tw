import { daysBetween, formatClock, formatDayHeading, shiftDayKey, taipeiDayKey } from "./time";
import { timelineItemKey } from "./timeline";
import type { TimelineItem } from "./types";

/**
 * `forward` anchors the rail at today and reads into the future — the default view.
 * `history` reads backwards from the newest item, for the 已完成 / 里程碑 filters.
 */
export type RailMode = "forward" | "history";

export type RailRow =
  | { type: "day"; key: string; dayKey: string; title: string; date: string; count: number }
  | { type: "fold"; key: string; clock: string; count: number; items: TimelineItem[] }
  | { type: "now"; key: string; clock: string; liveCount: number }
  | { type: "gap"; key: string; from: string; to: string; days: number }
  | { type: "item"; key: string; clock: string; item: TimelineItem }
  | { type: "tail"; key: string };

interface Dated {
  item: TimelineItem;
  at: number;
  dayKey: string;
}

function ms(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Where an item hangs on the rail. A timeline is read by when things *start*, so a
 * finished stream sits at its start time, not the moment it ended.
 */
export function railTime(item: TimelineItem): number {
  if (item.kind === "milestone") return ms(item.milestone.date);
  const { actualStart, scheduledStart, actualEnd } = item.stream;
  return ms(actualStart) || ms(scheduledStart) || ms(actualEnd);
}

function toDated(item: TimelineItem): Dated {
  const at = railTime(item);
  return { item, at, dayKey: taipeiDayKey(new Date(at).toISOString()) };
}

function itemRow(entry: Dated): RailRow {
  return {
    type: "item",
    key: timelineItemKey(entry.item),
    // A milestone is a dated all-day event; giving it a clock would be a lie.
    clock: entry.item.kind === "milestone" ? "" : formatClock(new Date(entry.at).toISOString()),
    item: entry.item,
  };
}

function dayRow(dayKey: string, nowMs: number, count: number): RailRow {
  const { title, date } = formatDayHeading(dayKey, nowMs);
  return { type: "day", key: `day:${dayKey}`, dayKey, title, date, count };
}

function buildHistory(dated: Dated[], nowMs: number): RailRow[] {
  if (dated.length === 0) return [];

  const sorted = [...dated].sort((left, right) => right.at - left.at);
  const perDay = new Map<string, number>();
  for (const entry of sorted) perDay.set(entry.dayKey, (perDay.get(entry.dayKey) ?? 0) + 1);

  const rows: RailRow[] = [];
  let currentDay: string | null = null;
  for (const entry of sorted) {
    if (entry.dayKey !== currentDay) {
      currentDay = entry.dayKey;
      rows.push(dayRow(entry.dayKey, nowMs, perDay.get(entry.dayKey) ?? 0));
    }
    rows.push(itemRow(entry));
  }
  rows.push({ type: "tail", key: "tail" });
  return rows;
}

function buildForward(dated: Dated[], nowMs: number, todayKey: string): RailRow[] {
  const ahead = dated
    .filter((entry) => entry.dayKey >= todayKey)
    .sort((left, right) => left.at - right.at);

  // Today always gets a divider and a now marker, even with nothing scheduled.
  const dayKeys = [...new Set([todayKey, ...ahead.map((entry) => entry.dayKey)])].sort();
  const liveCount = ahead.filter((entry) => entry.item.kind === "live").length;
  const nowRow: RailRow = {
    type: "now",
    key: "now",
    clock: formatClock(new Date(nowMs).toISOString()),
    liveCount,
  };

  const rows: RailRow[] = [];
  let previousDay: string | null = null;

  for (const dayKey of dayKeys) {
    if (previousDay && daysBetween(previousDay, dayKey) > 1) {
      const from = shiftDayKey(previousDay, 1);
      const to = shiftDayKey(dayKey, -1);
      rows.push({ type: "gap", key: `gap:${from}`, from, to, days: daysBetween(from, to) + 1 });
    }
    previousDay = dayKey;

    const entries = ahead.filter((entry) => entry.dayKey === dayKey);
    const isToday = dayKey === todayKey;
    // Streams that already ended today are history the moment you load the page —
    // they collapse into one row rather than pushing the live block off-screen.
    const folded = isToday ? entries.filter((entry) => entry.item.kind === "recent") : [];
    const listed = isToday ? entries.filter((entry) => entry.item.kind !== "recent") : entries;

    rows.push(dayRow(dayKey, nowMs, entries.length));

    const earliestFolded = folded[0];
    if (earliestFolded) {
      rows.push({
        type: "fold",
        key: `fold:${dayKey}`,
        clock: formatClock(new Date(earliestFolded.at).toISOString()),
        count: folded.length,
        items: folded.map((entry) => entry.item),
      });
    }

    if (!isToday) {
      rows.push(...listed.map(itemRow));
      continue;
    }

    let placedNow = false;
    for (const entry of listed) {
      if (!placedNow && entry.at > nowMs) {
        rows.push(nowRow);
        placedNow = true;
      }
      rows.push(itemRow(entry));
    }
    if (!placedNow) rows.push(nowRow);
  }

  rows.push({ type: "tail", key: "tail" });
  return rows;
}

/** Lay a filtered timeline out as rail rows: day dividers, a now marker, folds and gaps. */
export function buildRail(items: TimelineItem[], nowMs: number, mode: RailMode): RailRow[] {
  const dated = items.map(toDated).filter((entry) => entry.dayKey !== "");
  const todayKey = taipeiDayKey(new Date(nowMs).toISOString());
  return mode === "history" ? buildHistory(dated, nowMs) : buildForward(dated, nowMs, todayKey);
}
