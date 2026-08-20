import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { listMilestonesBetween, listStreamsByStatus, upsertChannelId, upsertStream } from "../src/db";
import { heavyRefresh, type RefreshDeps } from "../src/refresh";
import { readSnapshot } from "../src/r2";
import type { StreamRecord } from "../src/types";
import { vtubers } from "./fixtures/twvtuber";

const liveRec: StreamRecord = {
  videoId: "v1", channelId: "UCaaa", status: "live", title: "直播", thumbnailUrl: "https://t",
  scheduledStart: null, actualStart: "2026-07-21T00:00:00Z", actualEnd: null, concurrentViewers: 9,
};

function deps(over: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    fetchRecentVideoIds: async () => ["v1"],
    fetchVideoDetails: async () => [liveRec],
    fetchChannelMeta: async () => [{ channelId: "UCaaa", name: "水樹", avatarUrl: "https://a", uploadsPlaylist: "UUaaa" }],
    fetchRoster: async () => vtubers,
    now: () => "2026-07-21T00:00:00Z",
    ...over,
  };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM milestones");
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await env.DATA_PUBLIC.delete("streams/v1/snapshot.json");
  await env.DATA_PUBLIC.delete("streams/v1/archive/index.json");
  await upsertChannelId(env.DB, "UCaaa", "2026-07-01T00:00:00Z");
});

describe("heavyRefresh", () => {
  it("discovers, joins roster, and publishes a snapshot", async () => {
    const snap = await heavyRefresh(env, deps());
    expect(snap.live.map((s) => s.videoId)).toEqual(["v1"]);
    expect(snap.channels["UCaaa"]!.group).toBe("子午計畫");
    const persisted = await readSnapshot(env.DATA_PUBLIC);
    expect(persisted!.live.length).toBe(1);
  });

  it("removes a stored active stream omitted from a successful YouTube response", async () => {
    await upsertStream(env.DB, liveRec, "2026-07-20T00:00:00Z");
    const snap = await heavyRefresh(env, deps({ fetchVideoDetails: async () => [] }));

    expect(snap.live).toEqual([]);
    expect(await listStreamsByStatus(env.DB, "live")).toEqual([]);
    const retained = await env.DB
      .prepare("SELECT availability FROM streams WHERE video_id = 'v1'")
      .first<{ availability: string }>();
    expect(retained).toEqual({ availability: "unavailable" });
  });

  it("tolerates roster failure and still publishes", async () => {
    const snap = await heavyRefresh(env, deps({ fetchRoster: async () => { throw new Error("429"); } }));
    expect(snap.live.length).toBe(1);
    expect(snap.channels["UCaaa"]!.group).toBeNull();
  });

  it("backfills the complete milestone history from roster dates", async () => {
    await heavyRefresh(env, deps());
    const milestones = await listMilestonesBetween(env.DB, "2021-01-01", "2027-12-31");
    expect(milestones).toHaveLength(7);
    expect(milestones).toContainEqual({ channelId: "UCaaa", type: "debut", date: "2021-10-31" });
    expect(milestones).toContainEqual({ channelId: "UCaaa", type: "anniversary", date: "2025-10-31" });
  });

  it("tolerates channel-meta failure without discarding the cycle's stream data", async () => {
    const snap = await heavyRefresh(env, deps({ fetchChannelMeta: async () => { throw new Error("500"); } }));
    expect(snap.live.map((s) => s.videoId)).toEqual(["v1"]);
  });
});
