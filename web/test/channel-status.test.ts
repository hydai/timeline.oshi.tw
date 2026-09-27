import { describe, it, expect } from "vitest";
import { buildChannelStatuses, describeChannelStatus } from "@/lib/channel-status";
import type { SnapshotChannel, TimelineItem } from "@/lib/types";

const channel: SnapshotChannel = {
  name: "水樹",
  handle: "@mizuki",
  avatar: null,
  group: null,
  nationality: "TW",
  youtube_subs: 1,
  twvtuber_id: "mizuki",
};

// 2026-09-27 16:00 in Taipei.
const NOW = Date.parse("2026-09-27T08:00:00Z");

const stream = (
  kind: "live" | "upcoming" | "recent",
  channelId: string,
  times: { scheduledStart?: string; actualStart?: string } = {},
): TimelineItem => ({
  kind,
  sortAt: 0,
  stream: { videoId: `${channelId}-${kind}-${times.scheduledStart ?? ""}`, channelId, title: "t", thumbnail: null, url: "u", ...times },
  channel,
});

describe("buildChannelStatuses", () => {
  it("marks a channel with a live stream as live", () => {
    const statuses = buildChannelStatuses([stream("live", "a", { actualStart: "2026-09-27T07:00:00Z" })], NOW);
    expect(statuses.get("a")).toEqual({ live: true, nextStart: null });
  });

  it("keeps the earliest upcoming start", () => {
    const statuses = buildChannelStatuses([
      stream("upcoming", "a", { scheduledStart: "2026-09-29T12:00:00Z" }),
      stream("upcoming", "a", { scheduledStart: "2026-09-27T12:00:00Z" }),
    ], NOW);
    expect(statuses.get("a")).toEqual({ live: false, nextStart: "2026-09-27T12:00:00Z" });
  });

  it("ignores weekly-schedule placeholders parked far in the future", () => {
    const statuses = buildChannelStatuses([
      stream("upcoming", "a", { scheduledStart: "2028-09-19T15:45:00Z" }),
      // The nearest placeholder seen in real data sat 206 days out.
      stream("upcoming", "b", { scheduledStart: "2027-04-21T13:55:00Z" }),
    ], NOW);
    expect(statuses.size).toBe(0);
  });

  it("keeps a special stream announced months ahead", () => {
    const statuses = buildChannelStatuses([
      stream("upcoming", "a", { scheduledStart: "2026-11-26T12:00:00Z" }),
    ], NOW);
    expect(statuses.get("a")).toEqual({ live: false, nextStart: "2026-11-26T12:00:00Z" });
  });

  it("ignores upcoming streams without a start time, or long overdue", () => {
    const statuses = buildChannelStatuses([
      stream("upcoming", "a"),
      stream("upcoming", "b", { scheduledStart: "2026-09-24T12:00:00Z" }),
    ], NOW);
    expect(statuses.size).toBe(0);
  });

  it("does not treat finished streams as activity", () => {
    expect(buildChannelStatuses([stream("recent", "a")], NOW).size).toBe(0);
  });
});

describe("describeChannelStatus", () => {
  it("says a live channel is live", () => {
    expect(describeChannelStatus({ live: true, nextStart: "2026-09-27T12:00:00Z" }, NOW))
      .toEqual({ tone: "live", text: "直播中" });
  });

  it("names the day and Taipei time of the next stream", () => {
    expect(describeChannelStatus({ live: false, nextStart: "2026-09-27T12:00:00Z" }, NOW))
      .toEqual({ tone: "upcoming", text: "今天 20:00 開台" });
    expect(describeChannelStatus({ live: false, nextStart: "2026-09-28T13:30:00Z" }, NOW))
      .toEqual({ tone: "upcoming", text: "明天 21:30 開台" });
    expect(describeChannelStatus({ live: false, nextStart: "2026-10-03T13:00:00Z" }, NOW))
      .toEqual({ tone: "upcoming", text: "10/3 21:00 開台" });
  });

  it("says a stream that should have started is about to", () => {
    expect(describeChannelStatus({ live: false, nextStart: "2026-09-27T07:45:00Z" }, NOW))
      .toEqual({ tone: "upcoming", text: "即將開始" });
  });

  it("says nothing without activity", () => {
    expect(describeChannelStatus(undefined, NOW)).toBeNull();
  });
});
