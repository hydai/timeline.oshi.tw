import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { backfillChannel, type BackfillDeps } from "../src/backfill";
import { listStreamsByStatus, upsertChannelId } from "../src/db";
import type { StreamRecord } from "../src/types";

const CHANNEL = "UCaaa";

function vod(videoId: string, actualStart: string | null, actualEnd: string | null): StreamRecord {
  return {
    videoId, channelId: CHANNEL, status: "ended", title: videoId, thumbnailUrl: null,
    scheduledStart: null, actualStart, actualEnd, concurrentViewers: null,
  };
}

function deps(over: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    fetchUploadIds: async () => ({ ids: ["v1", "v2", "v3"], truncated: false }),
    fetchVideoDetails: async () => [
      vod("v1", "2024-01-05T10:00:00Z", "2024-01-05T12:00:00Z"),
      vod("v2", "2023-06-01T10:00:00Z", "2023-06-01T11:00:00Z"),
      vod("v3", null, null), // an ordinary upload, not a stream
    ],
    now: () => "2026-08-22T00:00:00Z",
    ...over,
  };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channels");
  await upsertChannelId(env.DB, CHANNEL, "2026-07-01T00:00:00Z");
});

describe("backfillChannel", () => {
  it("reports what the uploads playlist holds and how far back it reaches", async () => {
    const report = await backfillChannel(env, deps(), CHANNEL, { dryRun: true });

    expect(report).toMatchObject({
      channelId: CHANNEL,
      uploads: 3,
      livestreams: 2,
      oldest: "2023-06-01T10:00:00Z",
      newest: "2024-01-05T10:00:00Z",
      dryRun: true,
    });
  });

  it("counts quota as one unit per 50 for each of the two calls", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
    const report = await backfillChannel(
      env,
      deps({ fetchUploadIds: async () => ({ ids, truncated: false }), fetchVideoDetails: async () => [] }),
      CHANNEL,
      { dryRun: true },
    );

    // 3 playlistItems pages + 3 videos.list batches
    expect(report.quotaUnits).toBe(6);
  });

  it("writes nothing on a dry run", async () => {
    await backfillChannel(env, deps(), CHANNEL, { dryRun: true });

    expect(await listStreamsByStatus(env.DB, "ended")).toHaveLength(0);
  });

  it("stores only the livestreams when actually run", async () => {
    const report = await backfillChannel(env, deps(), CHANNEL, { dryRun: false });

    const stored = await listStreamsByStatus(env.DB, "ended");
    expect(stored.map((s) => s.videoId).sort()).toEqual(["v1", "v2"]);
    expect(report.inserted).toBe(2);
  });

  it("is safe to run twice", async () => {
    await backfillChannel(env, deps(), CHANNEL, { dryRun: false });
    await backfillChannel(env, deps(), CHANNEL, { dryRun: false });

    expect(await listStreamsByStatus(env.DB, "ended")).toHaveLength(2);
  });

  it("passes truncation through, so a partial backfill is visible", async () => {
    const report = await backfillChannel(
      env,
      deps({ fetchUploadIds: async () => ({ ids: ["v1"], truncated: true }) }),
      CHANNEL,
      { dryRun: true },
    );

    expect(report.truncated).toBe(true);
  });

  it("reports an empty history without falling over", async () => {
    const report = await backfillChannel(
      env,
      deps({ fetchUploadIds: async () => ({ ids: [], truncated: false }), fetchVideoDetails: async () => [] }),
      CHANNEL,
      { dryRun: true },
    );

    expect(report).toMatchObject({ uploads: 0, livestreams: 0, oldest: null, newest: null });
  });
});
