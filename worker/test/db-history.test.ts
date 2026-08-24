import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  getArchiveMonthSummary, listArchiveMonthSummaries, listEndedStreamsByMonth,
  listEndedStreamsSince, listMilestonesBetween, listMilestonesByMonth, upsertChannelId,
  upsertMilestonesBatch, upsertStream,
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
      {
        month: "2024-03",
        streams: 1,
        milestones: 1,
        by_channel: { UCaaa: { streams: 1, milestones: 1 } },
      },
    ]);
    expect((await listEndedStreamsByMonth(env.DB, "2024-03", "2026-07-21T00:00:00Z"))[0]!.videoId).toBe("old-stream");
    expect(await listMilestonesByMonth(env.DB, "2024-03", "2026-07-21")).toEqual([
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
    ]);
  });

  it("files a stream by its Taipei calendar month, not its UTC one", async () => {
    // 18:10Z on the last of the month is 02:10 the next morning in Taipei. Grouping by
    // UTC put it in April while the rail headed it 5/1 — the file and the page disagreed.
    await upsertStream(env.DB, {
      ...ended,
      videoId: "after-midnight",
      actualStart: "2025-04-30T16:00:30Z",
      actualEnd: "2025-04-30T18:10:58Z",
    }, "2025-04-30T18:15:00Z");
    await upsertStream(env.DB, {
      ...ended,
      videoId: "before-midnight",
      actualStart: "2025-04-30T14:00:00Z",
      actualEnd: "2025-04-30T15:59:59Z",
    }, "2025-04-30T16:05:00Z");
    await upsertMilestonesBatch(
      env.DB,
      [{ channelId: "UCaaa", type: "anniversary", date: "2025-05-01" }],
      "2026-07-21T00:00:00Z",
    );

    expect(await listArchiveMonthSummaries(env.DB, "2026-07-21T00:00:00Z")).toEqual([
      {
        month: "2025-05", streams: 1, milestones: 1,
        by_channel: { UCaaa: { streams: 1, milestones: 1 } },
      },
      {
        month: "2025-04", streams: 1, milestones: 0,
        by_channel: { UCaaa: { streams: 1, milestones: 0 } },
      },
    ]);
    expect((await listEndedStreamsByMonth(env.DB, "2025-05", "2026-07-21T00:00:00Z"))
      .map((stream) => stream.videoId)).toEqual(["after-midnight"]);
    expect((await listEndedStreamsByMonth(env.DB, "2025-04", "2026-07-21T00:00:00Z"))
      .map((stream) => stream.videoId)).toEqual(["before-midnight"]);
  });

  it("counts one month on its own, so the cheap pass need not aggregate the archive", async () => {
    await upsertStream(env.DB, ended, "2024-03-10T11:05:00Z");
    await upsertStream(env.DB, {
      ...ended, videoId: "next-month", actualStart: "2024-04-02T10:00:00Z", actualEnd: "2024-04-02T11:00:00Z",
    }, "2024-04-02T11:05:00Z");
    await upsertMilestonesBatch(env.DB, [
      { channelId: "UCaaa", type: "anniversary", date: "2024-03-15" },
      { channelId: "UCaaa", type: "anniversary", date: "2024-04-15" },
    ], "2026-07-21T00:00:00Z");

    expect(await getArchiveMonthSummary(env.DB, "2024-03", "2026-07-21T00:00:00Z")).toEqual({
      month: "2024-03",
      streams: 1,
      milestones: 1,
      by_channel: { UCaaa: { streams: 1, milestones: 1 } },
    });
  });

  it("counts a month by Taipei time and stops at the cutoff, exactly as the full pass does", async () => {
    await upsertStream(env.DB, {
      ...ended, videoId: "after-midnight",
      actualStart: "2024-03-31T16:00:30Z", actualEnd: "2024-03-31T18:00:00Z",
    }, "2024-03-31T18:05:00Z");
    await upsertStream(env.DB, {
      ...ended, videoId: "not-yet", actualStart: "2024-04-20T10:00:00Z", actualEnd: "2024-04-20T11:00:00Z",
    }, "2024-04-20T11:05:00Z");

    // 18:00Z on 3/31 is 02:00 on 4/1 in Taipei, so March holds none of it.
    expect((await getArchiveMonthSummary(env.DB, "2024-03", "2026-07-21T00:00:00Z")).streams).toBe(0);
    expect(await getArchiveMonthSummary(env.DB, "2024-04", "2024-04-10T00:00:00Z")).toEqual({
      month: "2024-04", streams: 1, milestones: 0, // "not-yet" is past the cutoff
      by_channel: { UCaaa: { streams: 1, milestones: 0 } },
    });
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
