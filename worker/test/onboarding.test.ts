import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import {
  processNextOnboarding,
  registerOnboardingCandidates,
  timelineOnboardingCandidates,
  type OnboardingRow,
} from "../src/onboarding";
import type { PrismStreamer } from "../src/prism";
import type { StreamRecord } from "../src/types";

const CHANNEL = "UC4zqD1cXreun2ivJiYh-ANw";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM milestones");
  await env.DB.exec("DELETE FROM streams");
  await env.DB.exec("DELETE FROM channel_onboarding");
  await env.DB.exec("DELETE FROM channels");
});

describe("timelineOnboardingCandidates", () => {
  it("deduplicates valid data channels and excludes hololive", () => {
    const streamers: PrismStreamer[] = [
      { youtubeChannelId: CHANNEL, handle: "@MsLin00", group: "個人勢" },
      { youtubeChannelId: CHANNEL, handle: "@MsLin00", group: "個人勢" },
      // The explicit exclusion still wins if affiliation data is temporarily wrong.
      { youtubeChannelId: "UC1opHUrw8rvnsadT-iGp7Cg", handle: "@minatoaqua", group: "個人勢" },
      { youtubeChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa", handle: "@holo", group: "hololive DEV_IS" },
      { youtubeChannelId: "not-a-channel", handle: null, group: "個人勢" },
    ];

    expect(timelineOnboardingCandidates(streamers)).toEqual([{ channelId: CHANNEL, handle: "@MsLin00" }]);
  });
});

describe("automatic onboarding", () => {
  it("atomically registers a channel and does not reset its job", async () => {
    const candidates = [{ channelId: CHANNEL, handle: "@MsLin00" }];

    expect(await registerOnboardingCandidates(env.DB, candidates, "2026-08-24T06:00:00Z")).toEqual([CHANNEL]);
    expect(await registerOnboardingCandidates(env.DB, candidates, "2026-08-24T12:00:00Z")).toEqual([]);

    const row = await env.DB.prepare("SELECT * FROM channel_onboarding WHERE channel_id = ?1")
      .bind(CHANNEL).first<OnboardingRow>();
    expect(row).toMatchObject({
      channel_id: CHANNEL,
      source: "data-vod",
      backfill_status: "pending",
      discovered_at: "2026-08-24T06:00:00Z",
      backfill_attempts: 0,
    });
  });

  it("records a failure and retries it on the next heavy pass", async () => {
    await registerOnboardingCandidates(env.DB, [{ channelId: CHANNEL, handle: "@MsLin00" }], "2026-08-24T06:00:00Z");
    const fetchUploadIds = vi.fn()
      .mockRejectedValueOnce(new Error("YouTube unavailable"))
      .mockResolvedValueOnce({ ids: ["history"], truncated: false });
    const historical: StreamRecord = {
      videoId: "history", channelId: CHANNEL, status: "ended", title: "history", thumbnailUrl: null,
      scheduledStart: null, actualStart: "2026-06-12T10:00:00Z", actualEnd: "2026-06-12T11:00:00Z",
      concurrentViewers: null,
    };
    const deps = { fetchUploadIds, fetchVideoDetails: async () => [historical], now: () => "unused" };

    expect(await processNextOnboarding(env, deps, "2026-08-24T06:00:00Z"))
      .toMatchObject({ channelId: CHANNEL, status: "failed", error: "YouTube unavailable" });
    expect(await processNextOnboarding(env, deps, "2026-08-24T12:00:00Z"))
      .toMatchObject({ channelId: CHANNEL, status: "complete" });

    expect(await env.DB.prepare(
      "SELECT backfill_status, backfill_attempts, last_error FROM channel_onboarding WHERE channel_id = ?1",
    ).bind(CHANNEL).first()).toEqual({ backfill_status: "complete", backfill_attempts: 2, last_error: null });
  });
});
