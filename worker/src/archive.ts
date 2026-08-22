import {
  getArchiveMonthSummary, listArchiveMonthSummaries, listChannels, listEndedStreamsByMonth,
  listMilestonesByMonth,
} from "./db";
import { readArchiveIndex, writeArchiveIndex, writeArchiveMonth } from "./r2";
import { toSnapshotChannel, toSnapshotStream } from "./snapshot";
import { taipeiMonth } from "./time";
import type {
  ArchiveIndex, ArchiveMonth, ArchiveMonthSummary, RosterEntry, SnapshotChannel,
} from "./types";

const GROUPING = "Asia/Taipei";

/**
 * "full" recounts every month from D1. "current-month" trusts the published index for
 * everything except the month still filling up.
 */
export type ArchiveScope = "full" | "current-month";

function countsMatch(left: ArchiveMonthSummary | undefined, right: ArchiveMonthSummary): boolean {
  return left?.streams === right.streams && left.milestones === right.milestones;
}

/** The published months with the one still filling up replaced by a fresh count. */
function withCurrentMonth(
  published: ArchiveMonthSummary[],
  current: ArchiveMonthSummary,
): ArchiveMonthSummary[] {
  const settled = published.filter((summary) => summary.month !== current.month);
  const months = current.streams + current.milestones > 0 ? [current, ...settled] : settled;
  return months.sort((left, right) => right.month.localeCompare(left.month));
}

export async function publishArchive(
  db: D1Database,
  bucket: R2Bucket,
  roster: Map<string, RosterEntry>,
  nowIso: string,
  scope: ArchiveScope = "full",
): Promise<ArchiveIndex> {
  const previous = await readArchiveIndex(bucket);
  const currentMonth = taipeiMonth(nowIso);
  // Moving a month boundary shuffles streams between files without necessarily changing
  // any count, which is all countsMatch can see — so a grouping change rewrites the lot.
  const regrouped = previous?.grouping !== GROUPING;
  // Aggregating every archived stream to rediscover that only the current month moved is
  // most of what this costs, and the light pass runs it every five minutes. The cheap
  // scope skips it, at the price of not seeing a settled month change behind it — a
  // video going private drops a row from an old month — which the next full pass fixes.
  const months = scope === "full" || previous == null || regrouped
    ? await listArchiveMonthSummaries(db, nowIso)
    : withCurrentMonth(previous.months, await getArchiveMonthSummary(db, currentMonth, nowIso));
  const previousByMonth = new Map((previous?.months ?? []).map((summary) => [summary.month, summary]));
  const changed = months.filter((summary) =>
    regrouped || summary.month === currentMonth || !countsMatch(previousByMonth.get(summary.month), summary),
  );

  if (changed.length > 0) {
    const channels = await listChannels(db);
    for (const summary of changed) {
      const [streams, milestones] = await Promise.all([
        listEndedStreamsByMonth(db, summary.month, nowIso),
        listMilestonesByMonth(db, summary.month, nowIso.slice(0, 10)),
      ]);
      const usedChannelIds = new Set([
        ...streams.map((stream) => stream.channelId),
        ...milestones.map((milestone) => milestone.channelId),
      ]);
      const channelMap: Record<string, SnapshotChannel> = {};
      for (const channel of channels) {
        if (!usedChannelIds.has(channel.channel_id)) continue;
        channelMap[channel.channel_id] = toSnapshotChannel(channel, roster.get(channel.channel_id));
      }
      const archive: ArchiveMonth = {
        version: "1.0.0",
        generated_at: nowIso,
        month: summary.month,
        channels: channelMap,
        streams: streams.map(toSnapshotStream),
        milestones,
      };
      await writeArchiveMonth(bucket, archive);
    }
  }

  const index: ArchiveIndex = { version: "1.0.0", generated_at: nowIso, grouping: GROUPING, months };
  await writeArchiveIndex(bucket, index);
  return index;
}
