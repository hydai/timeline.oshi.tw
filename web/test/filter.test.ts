import { describe, it, expect } from "vitest";
import {
  buildVTuberFilterOptions,
  filterTimeline,
  timelineChannelId,
} from "@/lib/filter";
import type { SnapshotChannel, TimelineItem } from "@/lib/types";

const channel = (
  name: string,
  handle: string,
  avatar: string | null = null,
): SnapshotChannel => ({
  name,
  handle,
  avatar,
  group: null,
  nationality: "TW",
  youtube_subs: 1,
  twvtuber_id: "t",
});

const streamItem = (
  name: string,
  channelId: string,
  handle = `@${name}`,
  avatar: string | null = null,
): TimelineItem => ({
  kind: "recent",
  sortAt: 0,
  stream: {
    videoId: `video-${channelId}-${name}`,
    channelId,
    title: "t",
    thumbnail: null,
    url: "u",
  },
  channel: channel(name, handle, avatar),
});

const milestoneItem = (
  name: string,
  channelId: string,
  handle = `@${name}`,
  avatar: string | null = null,
): TimelineItem => ({
  kind: "milestone",
  sortAt: 0,
  milestone: {
    channelId,
    type: "anniversary",
    date: "2026-07-24",
  },
  channel: channel(name, handle, avatar),
});

const items = [
  streamItem("水樹", "channel-mizuki", "@mizuki"),
  streamItem("Gabu", "channel-gabu", "@gabu"),
  streamItem("森森鈴蘭", "channel-linglan", "@linglan"),
  milestoneItem("水樹", "channel-mizuki", "@mizuki"),
];

describe("filterTimeline", () => {
  it("no filters returns all", () => {
    expect(filterTimeline(items, "", null)).toEqual(items);
  });

  it("name substring, case-insensitive", () => {
    expect(filterTimeline(items, "gab", null).map((i) => i.channel.name)).toEqual(["Gabu"]);
  });

  it("matches handle too", () => {
    expect(filterTimeline(items, "@MIZUKI", null).map((i) => i.channel.name)).toEqual(["水樹", "水樹"]);
  });

  it("filters by an exact channel ID", () => {
    expect(filterTimeline(items, "", "channel-mizuki").map(timelineChannelId)).toEqual([
      "channel-mizuki",
      "channel-mizuki",
    ]);
    expect(filterTimeline(items, "", "channel")).toEqual([]);
  });

  it("combines search and VTuber filters with AND", () => {
    expect(filterTimeline(items, "森", "channel-mizuki")).toEqual([]);
    expect(filterTimeline(items, "水", "channel-mizuki").map((i) => i.channel.name)).toEqual([
      "水樹",
      "水樹",
    ]);
  });

  it("uses milestone channel IDs when filtering", () => {
    const result = filterTimeline(items, "", "channel-mizuki");

    expect(result).toContain(items[3]);
    expect(result.some((item) => item.kind === "milestone")).toBe(true);
    expect(result.every((item) => timelineChannelId(item) === "channel-mizuki")).toBe(true);
  });
});

describe("buildVTuberFilterOptions", () => {
  it("counts stream and milestone items and orders by count, then name", () => {
    const optionItems = [
      streamItem("Beta", "channel-beta", "@beta", "https://example.com/beta.png"),
      streamItem("Alpha", "channel-alpha", "@alpha", "https://example.com/alpha.png"),
      milestoneItem("Alpha", "channel-alpha", "@alpha", "https://example.com/alpha.png"),
      milestoneItem("Beta", "channel-beta", "@beta", "https://example.com/beta.png"),
      streamItem("Gamma", "channel-gamma", "@gamma"),
    ];

    expect(buildVTuberFilterOptions(optionItems)).toEqual([
      {
        channelId: "channel-alpha",
        name: "Alpha",
        avatar: "https://example.com/alpha.png",
        itemCount: 2,
      },
      {
        channelId: "channel-beta",
        name: "Beta",
        avatar: "https://example.com/beta.png",
        itemCount: 2,
      },
      {
        channelId: "channel-gamma",
        name: "Gamma",
        avatar: null,
        itemCount: 1,
      },
    ]);
  });
});
