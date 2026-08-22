import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { upsertChannelId } from "../src/db";
import { getActiveVideoIds, listStreamsByStatus, markStreamsUnavailableBatch, upsertStream } from "../src/db";
import type { StreamRecord } from "../src/types";

const base: StreamRecord = {
  videoId: "v1", channelId: "UCaaa", status: "live", title: "唱歌",
  thumbnailUrl: "https://t", scheduledStart: null,
  actualStart: "2026-07-21T00:00:00Z", actualEnd: null, concurrentViewers: 10,
};

beforeEach(async () => {
  await env.DB.exec("DELETE FROM milestones");
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await upsertChannelId(env.DB, "UCaaa", "2026-07-20T00:00:00Z");
});

describe("streams db", () => {
  it("upserts and reads back by status", async () => {
    await upsertStream(env.DB, base, "2026-07-21T00:05:00Z");
    const live = await listStreamsByStatus(env.DB, "live");
    expect(live.map((s) => s.videoId)).toEqual(["v1"]);
    expect(live[0]!.concurrentViewers).toBe(10);
  });

  it("upsert preserves first_seen, updates status", async () => {
    await upsertStream(env.DB, base, "2026-07-21T00:05:00Z");
    await upsertStream(env.DB, { ...base, status: "ended", actualEnd: "2026-07-21T02:00:00Z" }, "2026-07-21T02:05:00Z");
    const ended = await listStreamsByStatus(env.DB, "ended");
    expect(ended.length).toBe(1);
  });

  it("getActiveVideoIds returns live and upcoming, plus what ended inside the window", async () => {
    await upsertStream(env.DB, base, "2026-07-21T00:05:00Z");
    await upsertStream(env.DB, {
      ...base, videoId: "v2", status: "ended", actualEnd: "2026-07-20T12:00:00Z",
    }, "2026-07-20T12:05:00Z");

    const ids = await getActiveVideoIds(env.DB, "2026-07-20T00:00:00Z");

    expect(ids).toContain("v1"); // live
    expect(ids).toContain("v2"); // ended recently — final numbers can still move
  });

  it("getActiveVideoIds leaves a long-finished stream alone however recently it was stored", async () => {
    // A backfill stores thousands of rows at once, so first_seen says when we learned of
    // a stream, not whether it can still change. Keying the window off first_seen made
    // one backfill turn every 30-minute refresh into a re-check of the entire archive —
    // 16,111 videos, 323 videos.list calls, over the whole day's quota in one run.
    await upsertStream(env.DB, {
      ...base, videoId: "old", status: "ended",
      actualStart: "2021-05-01T10:00:00Z", actualEnd: "2021-05-01T12:00:00Z",
    }, "2026-07-21T00:05:00Z");

    expect(await getActiveVideoIds(env.DB, "2026-07-20T00:00:00Z")).not.toContain("old");
  });

  it("keeps old ended streams permanently", async () => {
    await upsertStream(env.DB, { ...base, status: "ended", actualEnd: "2026-07-01T00:00:00Z" }, "2026-07-01T00:00:00Z");
    await upsertStream(env.DB, { ...base, videoId: "v2" }, "2026-07-21T00:00:00Z"); // live
    const all = [...(await listStreamsByStatus(env.DB, "ended")), ...(await listStreamsByStatus(env.DB, "live"))];
    expect(all.map((s) => s.videoId).sort()).toEqual(["v1", "v2"]);
  });

  it("revives a tombstoned stream when YouTube returns it again", async () => {
    await upsertStream(env.DB, base, "2026-07-21T00:05:00Z");
    await markStreamsUnavailableBatch(env.DB, [base.videoId], "2026-07-21T01:00:00Z");
    expect(await listStreamsByStatus(env.DB, "live")).toEqual([]);

    await upsertStream(env.DB, { ...base, concurrentViewers: 20 }, "2026-07-21T01:05:00Z");

    expect((await listStreamsByStatus(env.DB, "live"))[0]!.concurrentViewers).toBe(20);
    const row = await env.DB
      .prepare("SELECT availability, unavailable_at FROM streams WHERE video_id = ?1")
      .bind(base.videoId)
      .first<{ availability: string; unavailable_at: string | null }>();
    expect(row).toEqual({ availability: "available", unavailable_at: null });
  });
});
