import { taipeiDayKey } from "./time";
import type { ArchiveIndex, Milestone } from "./types";

const DAY = 86_400_000;

/**
 * Each channel's debut year. The worker derives every anniversary from the debut date,
 * so a channel's earliest month with a milestone is the month it debuted; the archive
 * index already counts milestones per channel per month, so no month file is needed.
 */
export function debutYears(index: ArchiveIndex | null): Map<string, number> {
  const years = new Map<string, number>();
  for (const summary of index?.months ?? []) {
    const year = Number(summary.month.slice(0, 4));
    for (const [channelId, counts] of Object.entries(summary.by_channel ?? {})) {
      if (counts.milestones <= 0) continue;
      const known = years.get(channelId);
      if (known === undefined || year < known) years.set(channelId, year);
    }
  }
  return years;
}

/** What the milestone is: 出道, 畢業, or which anniversary — 出道 3 週年. */
export function milestoneLabel(milestone: Milestone, debutYear: number | undefined): string {
  if (milestone.type === "debut") return "出道";
  if (milestone.type === "graduate") return "畢業";
  const years = debutYear === undefined ? 0 : Number(milestone.date.slice(0, 4)) - debutYear;
  return years >= 1 ? `出道 ${years} 週年` : "出道週年";
}

/** Whole Taipei calendar days from today until `date` (YYYY-MM-DD); negative once past. */
export function daysUntil(date: string, nowMs: number): number {
  const today = taipeiDayKey(new Date(nowMs).toISOString());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}

/** A countdown to a day still ahead; callers show nothing once it has passed. */
export function describeDaysUntil(days: number): string {
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  return `還有 ${days} 天`;
}
