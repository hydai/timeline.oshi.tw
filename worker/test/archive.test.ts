import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { publishArchive } from "../src/archive";
import {
  setChannelMeta, upsertChannelId, upsertMilestonesBatch, upsertStream,
} from "../src/db";
import { ARCHIVE_INDEX_KEY, archiveMonthKey, readArchiveIndex, writeArchiveIndex } from "../src/r2";
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
  await env.DATA_PUBLIC.delete([
    ARCHIVE_INDEX_KEY, archiveMonthKey("2024-03"), archiveMonthKey("2026-09"),
  ]);
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

  it("records how months are grouped", async () => {
    const index = await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), "2026-07-21T00:00:00Z");

    expect(index.grouping).toBe("Asia/Taipei");
    expect((await readArchiveIndex(env.DATA_PUBLIC))?.grouping).toBe("Asia/Taipei");
  });

  it("rewrites every month once when the grouping changes, count unchanged or not", async () => {
    await upsertStream(env.DB, historicalStream, "2024-03-01T11:05:00Z");
    // What is published today: grouped by UTC month, so no grouping recorded. Moving a
    // month boundary shuffles streams between files without necessarily changing a
    // count, which is all countsMatch can see.
    await writeArchiveIndex(env.DATA_PUBLIC, {
      version: "1.0.0",
      generated_at: "2026-07-20T00:00:00Z",
      months: [{ month: "2024-03", streams: 1, milestones: 0 }],
    });

    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), "2026-07-21T00:00:00Z");

    expect(await env.DATA_PUBLIC.get(archiveMonthKey("2024-03"))).not.toBeNull();
  });

  it("keeps refreshing the current Taipei month after UTC has fallen behind", async () => {
    await upsertStream(env.DB, {
      ...historicalStream,
      videoId: "just-after-midnight",
      actualStart: "2026-08-31T17:00:00Z",
      actualEnd: "2026-08-31T18:00:00Z", // 2026-09-01 02:00 in Taipei
    }, "2026-08-31T18:05:00Z");

    // 03:00 on 9/1 in Taipei, still 8/31 in UTC: September is the month still filling up.
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), "2026-08-31T19:00:00Z");
    await env.DATA_PUBLIC.delete(archiveMonthKey("2026-09"));
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), "2026-08-31T19:30:00Z");

    expect(await env.DATA_PUBLIC.get(archiveMonthKey("2026-09"))).not.toBeNull();
  });
});
