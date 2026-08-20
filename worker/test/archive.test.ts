import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { publishArchive } from "../src/archive";
import {
  setChannelMeta, upsertChannelId, upsertMilestonesBatch, upsertStream,
} from "../src/db";
import { ARCHIVE_INDEX_KEY, archiveMonthKey, readArchiveIndex } from "../src/r2";
import type { ArchiveMonth, RosterEntry, StreamRecord } from "../src/types";

const historicalStream: StreamRecord = {
  videoId: "history-1",
  channelId: "UCaaa",
  status: "ended",
  title: "永久保存的直播",
  thumbnailUrl: null,
  scheduledStart: null,
  actualStart: "2024-03-01T10:00:00Z",
  actualEnd: "2024-03-01T11:00:00Z",
  concurrentViewers: null,
};

beforeEach(async () => {
  await env.DB.exec("DELETE FROM milestones");
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await env.DATA_PUBLIC.delete([ARCHIVE_INDEX_KEY, archiveMonthKey("2024-03")]);
  await upsertChannelId(env.DB, "UCaaa", "2021-01-01T00:00:00Z");
  await setChannelMeta(env.DB, {
    channelId: "UCaaa",
    name: "水樹",
    avatarUrl: "https://example.com/a.jpg",
    uploadsPlaylist: "UUaaa",
  }, "2026-07-21T00:00:00Z");
});

describe("publishArchive", () => {
  it("publishes passed history by month while leaving future milestones in D1", async () => {
    await upsertStream(env.DB, historicalStream, "2024-03-01T11:05:00Z");
    await upsertMilestonesBatch(env.DB, [
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
      { channelId: "UCaaa", type: "anniversary", date: "2026-10-31" },
    ], "2026-07-21T00:00:00Z");
    const roster = new Map<string, RosterEntry>([["UCaaa", {
      youtubeId: "UCaaa",
      name: "水樹",
      group: "子午計畫",
      nationality: "TW",
      youtubeSubs: 207000,
      avatar: "https://example.com/roster.jpg",
      twvtuberId: "tw1",
    }]]);

    const index = await publishArchive(env.DB, env.DATA_PUBLIC, roster, "2026-07-21T00:00:00Z");

    expect(index.months).toEqual([{ month: "2024-03", streams: 1, milestones: 1 }]);
    expect(await readArchiveIndex(env.DATA_PUBLIC)).toEqual(index);
    const archived = await (await env.DATA_PUBLIC.get(archiveMonthKey("2024-03")))!.json<ArchiveMonth>();
    expect(archived.streams.map((stream) => stream.videoId)).toEqual(["history-1"]);
    expect(archived.milestones).toEqual([
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
    ]);
    expect(archived.channels.UCaaa).toMatchObject({ name: "水樹", group: "子午計畫" });
  });
});
