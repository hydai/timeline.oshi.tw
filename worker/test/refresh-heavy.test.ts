import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { listMilestonesBetween, listStreamsByStatus, upsertChannelId, upsertStream } from "../src/db";
import { heavyRefresh, type RefreshDeps } from "../src/refresh";
import { archiveMonthKey, readSnapshot } from "../src/r2";
import type { ArchiveMonth, StreamRecord } from "../src/types";
import { PRISM_MANIFEST_KEY, prismSnapshotKey } from "../src/prism";
import { uploadsPlaylistId } from "../src/youtube";
import { vtubers } from "./fixtures/twvtuber";

const PRISM_SHA = "b".repeat(64);

async function publishPrismGroups(groups: Record<string, string>): Promise<void> {
  await env.DATA_PUBLIC.put(PRISM_MANIFEST_KEY, JSON.stringify({ schemaVersion: "1.0.0", sha256: PRISM_SHA }));
  await env.DATA_PUBLIC.put(prismSnapshotKey(PRISM_SHA), JSON.stringify({
    schemaVersion: "1.0.0",
    streamers: Object.entries(groups).map(([youtubeChannelId, group]) => ({ youtubeChannelId, group })),
  }));
}

async function publishPrismStreamers(streamers: unknown[]): Promise<void> {
  await env.DATA_PUBLIC.put(PRISM_MANIFEST_KEY, JSON.stringify({ schemaVersion: "1.0.0", sha256: PRISM_SHA }));
  await env.DATA_PUBLIC.put(prismSnapshotKey(PRISM_SHA), JSON.stringify({ schemaVersion: "1.0.0", streamers }));
}

const liveRec: StreamRecord = {
  videoId: "v1", channelId: "UCaaa", status: "live", title: "直播", thumbnailUrl: "https://t",
  scheduledStart: null, actualStart: "2026-07-21T00:00:00Z", actualEnd: null, concurrentViewers: 9,
};

function deps(over: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    fetchRecentVideoIds: async () => ["v1"],
    fetchUploadIds: async () => ({ ids: [], truncated: false }),
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

  it("lets prism clear a company twvtuber still has on file", async () => {
    await publishPrismGroups({ UCaaa: "個人勢" });

    const snap = await heavyRefresh(env, deps());

    expect(snap.channels["UCaaa"]!.group).toBeNull();
    expect(snap.groups).not.toContain("子午計畫");
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

  it("onboards a new data streamer once, backfills history, and excludes hololive", async () => {
    const newcomer = "UC4zqD1cXreun2ivJiYh-ANw";
    const hololive = "UC1opHUrw8rvnsadT-iGp7Cg";
    await publishPrismStreamers([
      {
        youtubeChannelId: newcomer,
        displayName: "Ms.林鈴",
        group: "個人勢",
        socialLinks: { youtube: "https://www.youtube.com/@MsLin00" },
      },
      {
        youtubeChannelId: hololive,
        displayName: "Minato Aqua",
        group: "hololive",
        socialLinks: { youtube: "https://www.youtube.com/@minatoaqua" },
      },
    ]);
    const historical: StreamRecord = {
      videoId: "history-1", channelId: newcomer, status: "ended", title: "初配信", thumbnailUrl: "https://history",
      scheduledStart: null, actualStart: "2026-06-12T11:00:00Z", actualEnd: "2026-06-12T12:00:00Z",
      concurrentViewers: null,
    };
    const fetchUploadIds = vi.fn(async () => ({ ids: [historical.videoId], truncated: false }));
    const fetchVideoDetails = vi.fn(async (ids: string[]) => ids.includes(historical.videoId) ? [historical] : [liveRec]);
    const fetchChannelMeta = vi.fn(async (ids: string[]) => ids.map((channelId) => ({
      channelId,
      name: channelId === newcomer ? "Ms.林鈴" : "水樹",
      avatarUrl: `https://avatar/${channelId}`,
      uploadsPlaylist: uploadsPlaylistId(channelId),
    })));
    const fetchRecentVideoIds = vi.fn(async (channelId: string) => channelId === "UCaaa" ? ["v1"] : []);
    const newRoster = {
      id: "tw-new",
      name: "Ms.林鈴",
      youtube_id: newcomer,
      group_name: null,
      nationality: "TW",
      youtube_subs: 100,
      img_url: null,
      debut_date: "2026-06-12",
      graduate_date: null,
    };

    const d = deps({
      fetchRecentVideoIds,
      fetchUploadIds,
      fetchVideoDetails,
      fetchChannelMeta,
      fetchRoster: async () => [...vtubers, newRoster],
    });
    const first = await heavyRefresh(env, d);
    const second = await heavyRefresh(env, d);

    expect(first.channels[newcomer]).toMatchObject({ name: "Ms.林鈴", handle: "@MsLin00", twvtuber_id: "tw-new" });
    expect(first.channels[hololive]).toBeUndefined();
    expect(second.channels[newcomer]).toBeDefined();
    expect(fetchUploadIds).toHaveBeenCalledTimes(1);
    expect(fetchUploadIds).toHaveBeenCalledWith(uploadsPlaylistId(newcomer));
    expect((await listStreamsByStatus(env.DB, "ended")).map((stream) => stream.videoId)).toContain("history-1");
    expect(await env.DB.prepare(
      "SELECT backfill_status, backfill_attempts FROM channel_onboarding WHERE channel_id = ?1",
    ).bind(newcomer).first()).toEqual({ backfill_status: "complete", backfill_attempts: 1 });
    expect(await env.DB.prepare("SELECT 1 AS found FROM channels WHERE channel_id = ?1").bind(hololive).first()).toBeNull();
    const june = await (await env.DATA_PUBLIC.get(archiveMonthKey("2026-06")))!.json<ArchiveMonth>();
    expect(june.streams.map((stream) => stream.videoId)).toContain("history-1");
    expect(june.milestones).toContainEqual({ channelId: newcomer, type: "debut", date: "2026-06-12" });
  });
});
