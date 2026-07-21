import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { upsertChannelId } from "../src/db";
import { upsertStream, getActiveVideoIds, listStreamsByStatus, pruneEndedBefore } from "../src/db";
import type { StreamRecord } from "../src/types";

const base: StreamRecord = {
  videoId: "v1", channelId: "UCaaa", status: "live", title: "唱歌",
  thumbnailUrl: "https://t", scheduledStart: null,
  actualStart: "2026-07-21T00:00:00Z", actualEnd: null, concurrentViewers: 10,
};

beforeEach(async () => {
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

  it("getActiveVideoIds returns live/upcoming plus recently first_seen", async () => {
    await upsertStream(env.DB, base, "2026-07-21T00:05:00Z");
    await upsertStream(env.DB, { ...base, videoId: "v2", status: "ended" }, "2026-07-21T00:05:00Z");
    const ids = await getActiveVideoIds(env.DB, "2026-07-20T00:00:00Z");
    expect(ids).toContain("v1"); // live
    expect(ids).toContain("v2"); // ended but first_seen after cutoff
  });

  it("pruneEndedBefore deletes old ended streams only", async () => {
    await upsertStream(env.DB, { ...base, status: "ended", actualEnd: "2026-07-01T00:00:00Z" }, "2026-07-01T00:00:00Z");
    await upsertStream(env.DB, { ...base, videoId: "v2" }, "2026-07-21T00:00:00Z"); // live
    await pruneEndedBefore(env.DB, "2026-07-14T00:00:00Z");
    const all = [...(await listStreamsByStatus(env.DB, "ended")), ...(await listStreamsByStatus(env.DB, "live"))];
    expect(all.map((s) => s.videoId).sort()).toEqual(["v2"]);
  });
});
