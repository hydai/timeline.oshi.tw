import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  listArchiveMonthSummaries, listEndedStreamsByMonth, listEndedStreamsSince, listMilestonesBetween,
  listMilestonesByMonth, upsertChannelId, upsertMilestonesBatch, upsertStream,
} from "../src/db";
import type { StreamRecord } from "../src/types";

const ended: StreamRecord = {
  videoId: "old-stream",
  channelId: "UCaaa",
  status: "ended",
  title: "歷史直播",
  thumbnailUrl: "https://example.com/thumbnail.jpg",
  scheduledStart: null,
  actualStart: "2024-03-10T10:00:00Z",
  actualEnd: "2024-03-10T11:00:00Z",
  concurrentViewers: null,
};

beforeEach(async () => {
  await env.DB.exec("DELETE FROM milestones");
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await upsertChannelId(env.DB, "UCaaa", "2024-01-01T00:00:00Z");
});

describe("permanent history db", () => {
  it("upserts milestones idempotently without removing older dates", async () => {
    await upsertMilestonesBatch(env.DB, [
      { channelId: "UCaaa", type: "debut", date: "2021-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2022-10-31" },
    ], "2026-07-21T00:00:00Z");
    await upsertMilestonesBatch(env.DB, [
      { channelId: "UCaaa", type: "anniversary", date: "2022-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2023-10-31" },
    ], "2026-07-22T00:00:00Z");

    expect(await listMilestonesBetween(env.DB, "2020-01-01", "2026-12-31")).toEqual([
      { channelId: "UCaaa", type: "anniversary", date: "2023-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2022-10-31" },
      { channelId: "UCaaa", type: "debut", date: "2021-10-31" },
    ]);
    const original = await env.DB
      .prepare("SELECT first_seen, last_seen FROM milestones WHERE date = '2022-10-31'")
      .first<{ first_seen: string; last_seen: string }>();
    expect(original).toEqual({
      first_seen: "2026-07-21T00:00:00Z",
      last_seen: "2026-07-22T00:00:00Z",
    });
  });

  it("groups completed streams and passed milestones into monthly archive summaries", async () => {
    await upsertStream(env.DB, ended, "2024-03-10T11:05:00Z");
    await upsertMilestonesBatch(env.DB, [
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
      { channelId: "UCaaa", type: "anniversary", date: "2026-10-31" },
    ], "2026-07-21T00:00:00Z");

    expect(await listArchiveMonthSummaries(env.DB, "2026-07-21T00:00:00Z")).toEqual([
      { month: "2024-03", streams: 1, milestones: 1 },
    ]);
    expect((await listEndedStreamsByMonth(env.DB, "2024-03", "2026-07-21T00:00:00Z"))[0]!.videoId).toBe("old-stream");
    expect(await listMilestonesByMonth(env.DB, "2024-03", "2026-07-21")).toEqual([
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
    ]);
  });

  it("can read only the recent ended window without touching permanent older rows", async () => {
    await upsertStream(env.DB, ended, "2024-03-10T11:05:00Z");
    await upsertStream(env.DB, {
      ...ended,
      videoId: "recent-stream",
      actualStart: "2026-07-20T10:00:00Z",
      actualEnd: "2026-07-20T11:00:00Z",
    }, "2026-07-20T11:05:00Z");

    expect((await listEndedStreamsSince(env.DB, "2026-07-14T00:00:00Z")).map((stream) => stream.videoId)).toEqual([
      "recent-stream",
    ]);
    expect(await listEndedStreamsByMonth(env.DB, "2024-03", "2026-07-21T00:00:00Z")).toHaveLength(1);
  });
});
