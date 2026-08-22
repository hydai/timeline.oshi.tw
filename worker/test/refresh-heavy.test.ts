import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { listMilestonesBetween, listStreamsByStatus, upsertChannelId, upsertStream } from "../src/db";
import { heavyRefresh, type RefreshDeps } from "../src/refresh";
import { readSnapshot } from "../src/r2";
import type { StreamRecord } from "../src/types";
import { PRISM_MANIFEST_KEY, prismSnapshotKey } from "../src/prism";
import { vtubers } from "./fixtures/twvtuber";

const PRISM_SHA = "b".repeat(64);

async function publishPrismGroups(groups: Record<string, string>): Promise<void> {
  await env.DATA_PUBLIC.put(PRISM_MANIFEST_KEY, JSON.stringify({ schemaVersion: "1.0.0", sha256: PRISM_SHA }));
  await env.DATA_PUBLIC.put(prismSnapshotKey(PRISM_SHA), JSON.stringify({
    schemaVersion: "1.0.0",
    streamers: Object.entries(groups).map(([youtubeChannelId, group]) => ({ youtubeChannelId, group })),
  }));
}

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
  await env.DATA_PUBLIC.delete([PRISM_MANIFEST_KEY, prismSnapshotKey(PRISM_SHA)]);
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

  it("prefers prism's company name over twvtuber's brand name", async () => {
    // twvtuber files this channel under 子午計畫; prism is the authority for company names.
    await publishPrismGroups({ UCaaa: "春魚創意" });

    const snap = await heavyRefresh(env, deps());

    expect(snap.channels["UCaaa"]!.group).toBe("春魚創意");
    expect(snap.groups).toContain("春魚創意");
  });

  it("keeps the twvtuber company when prism has no affiliation on file", async () => {
    await publishPrismGroups({ UCaaa: "個人勢" });

    const snap = await heavyRefresh(env, deps());

    expect(snap.channels["UCaaa"]!.group).toBe("子午計畫");
  });

  it("publishes unchanged when prism data is unavailable", async () => {
    const snap = await heavyRefresh(env, deps());

    expect(snap.channels["UCaaa"]!.group).toBe("子午計畫");
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
