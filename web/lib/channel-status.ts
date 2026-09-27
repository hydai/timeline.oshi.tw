import { formatClock, formatDayHeading, taipeiDayKey } from "./time";
import type { TimelineItem } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * Channels park their weekly-schedule posts as streams scheduled far out, and a stream
 * that never started lingers as "upcoming". Neither is a next stream. Real streams in the
 * data sit within three weeks and the nearest placeholder 206 days out, so a quarter
 * keeps events announced well ahead while leaving the placeholders out.
 */
const LOOKAHEAD = 90 * DAY;
const OVERDUE = HOUR;

export interface ChannelStatus {
  live: boolean;
  /** The earliest believable scheduled start, or null. */
  nextStart: string | null;
}

/** What each channel is doing now, for the VTuber picker. Channels doing nothing are absent. */
export function buildChannelStatuses(items: TimelineItem[], nowMs: number): Map<string, ChannelStatus> {
  const statuses = new Map<string, ChannelStatus>();
  for (const item of items) {
    if (item.kind !== "live" && item.kind !== "upcoming") continue;
    const channelId = item.stream.channelId;
    const status = statuses.get(channelId) ?? { live: false, nextStart: null };
    if (item.kind === "live") {
      status.live = true;
    } else {
      const start = item.stream.scheduledStart;
      const at = start ? Date.parse(start) : Number.NaN;
      if (Number.isNaN(at) || at < nowMs - OVERDUE || at > nowMs + LOOKAHEAD) continue;
      if (!status.nextStart || at < Date.parse(status.nextStart)) status.nextStart = start!;
    }
    statuses.set(channelId, status);
  }
  return statuses;
}

export function describeChannelStatus(
  status: ChannelStatus | undefined,
  nowMs: number,
): { tone: "live" | "upcoming"; text: string } | null {
  if (!status) return null;
  if (status.live) return { tone: "live", text: "直播中" };
  if (!status.nextStart) return null;
  if (Date.parse(status.nextStart) <= nowMs) return { tone: "upcoming", text: "即將開始" };
  const { title } = formatDayHeading(taipeiDayKey(status.nextStart), nowMs);
  return { tone: "upcoming", text: `${title} ${formatClock(status.nextStart)} 開台` };
}
