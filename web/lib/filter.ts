import type { TimelineItem } from "./types";

export function filterTimeline(items: TimelineItem[], query: string, selectedGroups: string[]): TimelineItem[] {
  const q = query.trim().toLowerCase();
  const groups = new Set(selectedGroups);
  return items.filter((it) => {
    if (q) {
      const name = (it.channel.name ?? "").toLowerCase();
      const handle = (it.channel.handle ?? "").toLowerCase();
      if (!name.includes(q) && !handle.includes(q)) return false;
    }
    if (groups.size > 0) {
      if (it.channel.group == null || !groups.has(it.channel.group)) return false;
    }
    return true;
  });
}
