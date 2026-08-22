import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import {
  listStreamsByStatus, markStreamsUnavailableBatch, upsertChannelId, upsertMilestonesBatch, upsertStream,
} from "../src/db";
import { lightRefresh, type RefreshDeps } from "../src/refresh";
import { writeSnapshot } from "../src/r2";
import type { Snapshot, StreamRecord } from "../src/types";

const upcomingRec: StreamRecord = {
  videoId: "U", channelId: "UCaaa", status: "upcoming", title: "預定", thumbnailUrl: "https://t",
  scheduledStart: "2026-07-21T01:00:00Z", actualStart: null, actualEnd: null, concurrentViewers: null,
};

const lastHeavy: Snapshot = {
  version: "1.0.0", generated_at: "2026-07-21T00:00:00Z", heavy_refreshed_at: "2026-07-21T00:00:00Z",
  channels: { UCaaa: { name: "水樹", handle: "@mizuki", avatar: "https://a", group: "子午計畫", nationality: "TW", youtube_subs: 207000, twvtuber_id: "tw1" } },
  groups: ["子午計畫"],
  live: [], upcoming: [], recent: [],
  milestones: [{ channelId: "UCaaa", type: "anniversary", date: "2026-07-20" }],
};

function deps(over: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    fetchRecentVideoIds: vi.fn(async () => []),
    fetchVideoDetails: async () => [{ ...upcomingRec, status: "live", actualStart: "2026-07-21T01:05:00Z", concurrentViewers: 12 }],
    fetchChannelMeta: vi.fn(async () => []),
    fetchRoster: vi.fn(async () => []),
    now: () => "2026-07-21T01:10:00Z",
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
  await upsertStream(env.DB, upcomingRec, "2026-07-21T00:00:00Z");
  await upsertMilestonesBatch(env.DB, lastHeavy.milestones, "2026-07-21T00:00:00Z");
  await writeSnapshot(env.DATA_PUBLIC, lastHeavy);
});

afterEach(() => vi.restoreAllMocks());

describe("lightRefresh", () => {
  it("flips a known upcoming to live, preserving channels+milestones+heavy time", async () => {
    const d = deps();
    const snap = await lightRefresh(env, d);
    expect(snap!.live.map((s) => s.videoId)).toEqual(["U"]);
    expect(snap!.channels["UCaaa"]!.group).toBe("子午計畫");
    expect(snap!.milestones.length).toBe(1);
    expect(snap!.heavy_refreshed_at).toBe("2026-07-21T00:00:00Z");
    expect(snap!.generated_at).toBe("2026-07-21T01:10:00Z");
    // The light path reads the channel feeds, but never the twvtuber/channel deps.
    expect(d.fetchChannelMeta).not.toHaveBeenCalled();
    expect(d.fetchRoster).not.toHaveBeenCalled();
  });

  it("picks up a stream the feeds show that we have never seen", async () => {
    // Without this a stream that goes up between heavy refreshes waits as long as six
    // hours to appear, however often the light pass runs.
    const d = deps({
      fetchRecentVideoIds: vi.fn(async () => ["NEW"]),
      fetchVideoDetails: vi.fn(async () => [
        { ...upcomingRec, status: "live" as const, actualStart: "2026-07-21T01:05:00Z" },
        {
          ...upcomingRec, videoId: "NEW", status: "live" as const,
          scheduledStart: null, actualStart: "2026-07-21T01:08:00Z",
        },
      ]),
    });

    const snap = await lightRefresh(env, d);

    expect(snap!.live.map((s) => s.videoId).sort()).toEqual(["NEW", "U"]);
    expect(d.fetchRecentVideoIds).toHaveBeenCalled();
  });

  it("does not re-ask about a feed entry it already holds", async () => {
    // A finished upload we stored months ago cannot change, and one that still can is
    // already in the active set — asking again just spends quota.
    await upsertStream(env.DB, {
      ...upcomingRec, videoId: "OLD", status: "ended", scheduledStart: null,
      actualStart: "2026-05-01T10:00:00Z", actualEnd: "2026-05-01T12:00:00Z",
    }, "2026-05-01T12:05:00Z");
    const fetchVideoDetails = vi.fn(async (_ids: string[]) => [
      { ...upcomingRec, status: "live" as const, actualStart: "2026-07-21T01:05:00Z" },
    ]);

    await lightRefresh(env, deps({
      fetchRecentVideoIds: vi.fn(async () => ["OLD"]),
      fetchVideoDetails,
    }));

    expect(fetchVideoDetails.mock.calls[0]![0]).not.toContain("OLD");
  });

  it("asks again about a tombstoned feed entry, in case it is back", async () => {
    await upsertStream(env.DB, {
      ...upcomingRec, videoId: "GONE", status: "ended", scheduledStart: null,
      actualStart: "2026-05-01T10:00:00Z", actualEnd: "2026-05-01T12:00:00Z",
    }, "2026-05-01T12:05:00Z");
    await markStreamsUnavailableBatch(env.DB, ["GONE"], "2026-05-02T00:00:00Z");
    const fetchVideoDetails = vi.fn(async (_ids: string[]) => [
      { ...upcomingRec, status: "live" as const, actualStart: "2026-07-21T01:05:00Z" },
    ]);

    await lightRefresh(env, deps({
      fetchRecentVideoIds: vi.fn(async () => ["GONE"]),
      fetchVideoDetails,
    }));

    expect(fetchVideoDetails.mock.calls[0]![0]).toContain("GONE");
  });

  it("removes a known active stream omitted from a successful YouTube response", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snap = await lightRefresh(env, deps({ fetchVideoDetails: async () => [] }));

    expect(snap!.live).toEqual([]);
    expect(snap!.upcoming).toEqual([]);
    expect(await listStreamsByStatus(env.DB, "upcoming")).toEqual([]);
    const retained = await env.DB
      .prepare("SELECT availability FROM streams WHERE video_id = 'U'")
      .first<{ availability: string }>();
    expect(retained).toEqual({ availability: "unavailable" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"videoIds":["U"]'));
  });

  it("keeps returned streams while removing omitted peers from the same request", async () => {
    await upsertStream(env.DB, {
      ...upcomingRec, videoId: "PRIVATE", status: "live", scheduledStart: null,
      actualStart: "2026-07-20T23:00:00Z",
    }, "2026-07-21T00:00:00Z");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const snap = await lightRefresh(env, deps());

    expect(snap!.live.map((s) => s.videoId)).toEqual(["U"]);
    expect((await listStreamsByStatus(env.DB, "live")).map((s) => s.videoId)).toEqual(["U"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"videoIds":["PRIVATE"]'));
  });

  it("keeps known active streams when the YouTube request fails", async () => {
    await expect(lightRefresh(env, deps({
      fetchVideoDetails: async () => { throw new Error("YouTube unavailable"); },
    }))).rejects.toThrow("YouTube unavailable");

    expect((await listStreamsByStatus(env.DB, "upcoming")).map((s) => s.videoId)).toEqual(["U"]);
  });

  it("returns null when no prior heavy snapshot exists", async () => {
    await env.DATA_PUBLIC.delete("streams/v1/snapshot.json");
    expect(await lightRefresh(env, deps())).toBeNull();
  });

  it("keeps twvtuber_id null for a tracked-but-unmatched channel instead of falling back to its YouTube id", async () => {
    // UCbbb mirrors what heavyRefresh publishes for a channel with no twvtuber match:
    // roster.get(cid) is undefined, so group/nationality/youtube_subs/twvtuber_id are all null.
    const unmatchedRec: StreamRecord = {
      videoId: "V1", channelId: "UCbbb", status: "live", title: "未配對頻道", thumbnailUrl: "https://t2",
      scheduledStart: null, actualStart: "2026-07-21T01:00:00Z", actualEnd: null, concurrentViewers: 5,
    };
    await upsertChannelId(env.DB, "UCbbb", "2026-07-01T00:00:00Z");
    await upsertStream(env.DB, unmatchedRec, "2026-07-21T00:00:00Z");
    await writeSnapshot(env.DATA_PUBLIC, {
      ...lastHeavy,
      channels: {
        ...lastHeavy.channels,
        UCbbb: {
          name: "UCbbb", handle: null, avatar: null,
          group: null, nationality: null, youtube_subs: null, twvtuber_id: null,
        },
      },
    });

    const snap = await lightRefresh(env, deps());

    expect(snap!.channels["UCbbb"]!.twvtuber_id).toBeNull();
    expect(snap!.channels["UCbbb"]!.group).toBeNull();
  });
});
