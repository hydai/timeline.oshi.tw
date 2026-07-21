import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { upsertChannelId, upsertStreamsBatch, setChannelMetasBatch, listStreamsByStatus, listEnabledChannels } from "../src/db";
import type { ChannelMeta, StreamRecord } from "../src/types";

const base: StreamRecord = {
  videoId: "v1", channelId: "UCaaa", status: "live", title: "唱歌",
  thumbnailUrl: "https://t", scheduledStart: null,
  actualStart: "2026-07-21T00:00:00Z", actualEnd: null, concurrentViewers: 10,
};

beforeEach(async () => {
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await upsertChannelId(env.DB, "UCaaa", "2026-07-20T00:00:00Z");
  await upsertChannelId(env.DB, "UCbbb", "2026-07-20T00:00:00Z");
});

describe("upsertStreamsBatch", () => {
  it("inserts multiple streams in one call, readable back by status", async () => {
    const recs: StreamRecord[] = [
      { ...base, videoId: "v1", channelId: "UCaaa", status: "live" },
      { ...base, videoId: "v2", channelId: "UCbbb", status: "upcoming", scheduledStart: "2026-07-21T02:00:00Z" },
    ];
    await upsertStreamsBatch(env.DB, recs, "2026-07-21T00:05:00Z");
    const live = await listStreamsByStatus(env.DB, "live");
    const upcoming = await listStreamsByStatus(env.DB, "upcoming");
    expect(live.map((s) => s.videoId)).toEqual(["v1"]);
    expect(upcoming.map((s) => s.videoId)).toEqual(["v2"]);
  });

  it("is idempotent — a second call updates existing rows on conflict instead of duplicating", async () => {
    const recs: StreamRecord[] = [
      { ...base, videoId: "v1", channelId: "UCaaa", status: "live" },
      { ...base, videoId: "v2", channelId: "UCbbb", status: "upcoming" },
    ];
    await upsertStreamsBatch(env.DB, recs, "2026-07-21T00:05:00Z");
    await upsertStreamsBatch(
      env.DB,
      [{ ...recs[0]!, status: "ended", actualEnd: "2026-07-21T02:00:00Z" }],
      "2026-07-21T02:05:00Z",
    );
    const ended = await listStreamsByStatus(env.DB, "ended");
    const live = await listStreamsByStatus(env.DB, "live");
    expect(ended.map((s) => s.videoId)).toEqual(["v1"]);
    expect(live).toEqual([]);
  });

  it("no-ops on an empty array (never calls db.batch([]))", async () => {
    const batchSpy = vi.spyOn(env.DB, "batch");
    await expect(upsertStreamsBatch(env.DB, [], "2026-07-21T00:05:00Z")).resolves.toBeUndefined();
    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });

  it("chunks large inputs into multiple db.batch() calls of at most 100 statements", async () => {
    const recs: StreamRecord[] = Array.from({ length: 250 }, (_, i) => ({
      ...base, videoId: `v${i}`, channelId: i % 2 === 0 ? "UCaaa" : "UCbbb",
    }));
    const batchSpy = vi.spyOn(env.DB, "batch");
    await upsertStreamsBatch(env.DB, recs, "2026-07-21T00:05:00Z");
    expect(batchSpy.mock.calls.map(([stmts]) => stmts.length)).toEqual([100, 100, 50]);
    batchSpy.mockRestore();

    const live = await listStreamsByStatus(env.DB, "live");
    expect(live.length).toBe(250);
  });
});

describe("setChannelMetasBatch", () => {
  it("updates multiple channels' metadata in one call", async () => {
    const metas: ChannelMeta[] = [
      { channelId: "UCaaa", name: "水樹", avatarUrl: "https://a", uploadsPlaylist: "UUaaa" },
      { channelId: "UCbbb", name: "花海", avatarUrl: "https://b", uploadsPlaylist: "UUbbb" },
    ];
    await setChannelMetasBatch(env.DB, metas, "2026-07-21T01:00:00Z");
    const rows = await listEnabledChannels(env.DB);
    const byId = Object.fromEntries(rows.map((r) => [r.channel_id, r]));
    expect(byId["UCaaa"]!.name).toBe("水樹");
    expect(byId["UCaaa"]!.uploads_playlist).toBe("UUaaa");
    expect(byId["UCaaa"]!.meta_checked_at).toBe("2026-07-21T01:00:00Z");
    expect(byId["UCbbb"]!.name).toBe("花海");
    expect(byId["UCbbb"]!.uploads_playlist).toBe("UUbbb");
  });

  it("no-ops on an empty array (never calls db.batch([]))", async () => {
    const batchSpy = vi.spyOn(env.DB, "batch");
    await expect(setChannelMetasBatch(env.DB, [], "2026-07-21T01:00:00Z")).resolves.toBeUndefined();
    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });

  it("chunks large inputs into multiple db.batch() calls of at most 100 statements", async () => {
    const metas: ChannelMeta[] = Array.from({ length: 150 }, (_, i) => ({
      channelId: `UCsynthetic${i}`, name: `n${i}`, avatarUrl: "https://a", uploadsPlaylist: `UU${i}`,
    }));
    const batchSpy = vi.spyOn(env.DB, "batch");
    await setChannelMetasBatch(env.DB, metas, "2026-07-21T01:00:00Z");
    expect(batchSpy.mock.calls.map(([stmts]) => stmts.length)).toEqual([100, 50]);
    batchSpy.mockRestore();
  });
});
