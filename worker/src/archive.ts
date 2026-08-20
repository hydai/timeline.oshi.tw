import {
  listArchiveMonthSummaries, listChannels, listEndedStreamsByMonth, listMilestonesByMonth,
} from "./db";
import { readArchiveIndex, writeArchiveIndex, writeArchiveMonth } from "./r2";
import { toSnapshotChannel, toSnapshotStream } from "./snapshot";
import type {
  ArchiveIndex, ArchiveMonth, ArchiveMonthSummary, RosterEntry, SnapshotChannel,
} from "./types";

function countsMatch(left: ArchiveMonthSummary | undefined, right: ArchiveMonthSummary): boolean {
  return left?.streams === right.streams && left.milestones === right.milestones;
}

export async function publishArchive(
  db: D1Database,
  bucket: R2Bucket,
  roster: Map<string, RosterEntry>,
  nowIso: string,
): Promise<ArchiveIndex> {
  const months = await listArchiveMonthSummaries(db, nowIso);
  const previous = await readArchiveIndex(bucket);
  const previousByMonth = new Map((previous?.months ?? []).map((summary) => [summary.month, summary]));
  const currentMonth = nowIso.slice(0, 7);
  const changed = months.filter(
    (summary) => summary.month === currentMonth || !countsMatch(previousByMonth.get(summary.month), summary),
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

  const index: ArchiveIndex = { version: "1.0.0", generated_at: nowIso, months };
  await writeArchiveIndex(bucket, index);
  return index;
}
