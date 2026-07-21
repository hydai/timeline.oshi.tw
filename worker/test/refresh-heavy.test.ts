import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { upsertChannelId } from "../src/db";
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
    fetchMilestones: async () => [],
    now: () => "2026-07-21T00:00:00Z",
    ...over,
  };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await env.DATA_PUBLIC.delete("streams/v1/snapshot.json");
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

  it("tolerates roster failure and still publishes", async () => {
    const snap = await heavyRefresh(env, deps({ fetchRoster: async () => { throw new Error("429"); } }));
    expect(snap.live.length).toBe(1);
    expect(snap.channels["UCaaa"]!.group).toBeNull();
  });
});
