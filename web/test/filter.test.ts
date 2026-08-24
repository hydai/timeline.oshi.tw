import { describe, it, expect } from "vitest";
import {
  buildGroupFilterOptions,
  buildTimelineFilterStats,
  buildTimelineKindCounts,
  buildVTuberFilterOptions,
  filterTimeline,
  timelineChannelId,
  UNGROUPED_FILTER_VALUE,
} from "@/lib/filter";
import type { ArchiveIndex, SnapshotChannel, TimelineItem } from "@/lib/types";

type StreamTimelineKind = Exclude<TimelineItem["kind"], "milestone">;

const channel = (
  name: string,
  handle: string,
  avatar: string | null = null,
  group: string | null = null,
): SnapshotChannel => ({
  name,
  handle,
  avatar,
  group,
  nationality: "TW",
  youtube_subs: 1,
  twvtuber_id: "t",
});

const streamItem = (
  name: string,
  channelId: string,
  handle = `@${name}`,
  avatar: string | null = null,
  kind: StreamTimelineKind = "recent",
  group: string | null = null,
): TimelineItem => ({
  kind,
  sortAt: 0,
  stream: {
    videoId: `video-${channelId}-${name}`,
    channelId,
    title: "t",
    thumbnail: null,
    url: "u",
  },
  channel: channel(name, handle, avatar, group),
});

const milestoneItem = (
  name: string,
  channelId: string,
  handle = `@${name}`,
  avatar: string | null = null,
  group: string | null = null,
): TimelineItem => ({
  kind: "milestone",
  sortAt: 0,
  milestone: {
    channelId,
    type: "anniversary",
    date: "2026-07-24",
  },
  channel: channel(name, handle, avatar, group),
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

  it("filters by live, upcoming, completed, and milestone kinds", () => {
    const categorized = [
      streamItem("Live", "channel-live", "@live", null, "live"),
      streamItem("Upcoming", "channel-upcoming", "@upcoming", null, "upcoming"),
      streamItem("Completed", "channel-completed", "@completed", null, "recent"),
      milestoneItem("Milestone", "channel-milestone"),
    ];

    expect(filterTimeline(categorized, "", null, "live").map((item) => item.kind)).toEqual(["live"]);
    expect(filterTimeline(categorized, "", null, "upcoming").map((item) => item.kind)).toEqual(["upcoming"]);
    expect(filterTimeline(categorized, "", null, "recent").map((item) => item.kind)).toEqual(["recent"]);
    expect(filterTimeline(categorized, "", null, "milestone").map((item) => item.kind)).toEqual(["milestone"]);
  });

  it("combines content type with search and VTuber filters", () => {
    const categorized = [
      streamItem("水樹", "channel-mizuki", "@mizuki", null, "live"),
      streamItem("水樹", "channel-mizuki", "@mizuki", null, "recent"),
      streamItem("Gabu", "channel-gabu", "@gabu", null, "live"),
    ];

    expect(filterTimeline(categorized, "水", "channel-mizuki", "live")).toEqual([categorized[0]]);
    expect(filterTimeline(categorized, "水", "channel-mizuki", "upcoming")).toEqual([]);
  });

  it("uses milestone channel IDs when filtering", () => {
    const result = filterTimeline(items, "", "channel-mizuki");

    expect(result).toContain(items[3]);
    expect(result.some((item) => item.kind === "milestone")).toBe(true);
    expect(result.every((item) => timelineChannelId(item) === "channel-mizuki")).toBe(true);
  });

  it("filters companies and ungrouped VTubers and composes with other filters", () => {
    const grouped = [
      streamItem("水樹", "channel-mizuki", "@mizuki", null, "live", "子午計畫"),
      streamItem("煌", "channel-kirali", "@kirali", null, "recent", "子午計畫"),
      streamItem("Gabu", "channel-gabu", "@gabu", null, "live"),
      milestoneItem("白白虹", "channel-rainbow", "@rainbow", null, "SquareLive"),
    ];

    expect(filterTimeline(grouped, "", null, null, "子午計畫").map((item) => item.channel.name)).toEqual([
      "水樹",
      "煌",
    ]);
    expect(filterTimeline(grouped, "", null, null, UNGROUPED_FILTER_VALUE)).toEqual([grouped[2]]);
    expect(filterTimeline(grouped, "水", "channel-mizuki", "live", "子午計畫")).toEqual([grouped[0]]);
    expect(filterTimeline(grouped, "", null, "recent", "SquareLive")).toEqual([]);
  });
});

describe("buildGroupFilterOptions", () => {
  it("puts individual VTubers first, counts items, and preserves known empty groups", () => {
    const grouped = [
      streamItem("水樹", "channel-mizuki", "@mizuki", null, "live", "子午計畫"),
      milestoneItem("煌", "channel-kirali", "@kirali", null, "子午計畫"),
      streamItem("Gabu", "channel-gabu"),
      streamItem("白白虹", "channel-rainbow", "@rainbow", null, "recent", "SquareLive"),
    ];

    const options = buildGroupFilterOptions(grouped, ["空團體", "子午計畫"]);

    expect(options[0]).toEqual({
      value: UNGROUPED_FILTER_VALUE,
      name: "個人勢",
      itemCount: 1,
    });
    expect(options.find((option) => option.value === "子午計畫")?.itemCount).toBe(2);
    expect(options.find((option) => option.value === "SquareLive")?.itemCount).toBe(1);
    expect(options.find((option) => option.value === "空團體")?.itemCount).toBe(0);
    expect(options.slice(1).map((option) => option.name)).toEqual(
      options.slice(1).map((option) => option.name).sort((left, right) => left.localeCompare(right, "zh-TW")),
    );
  });
});

describe("buildTimelineKindCounts", () => {
  it("counts each content type independently", () => {
    const categorized = [
      streamItem("Live 1", "channel-live-1", "@live1", null, "live"),
      streamItem("Live 2", "channel-live-2", "@live2", null, "live"),
      streamItem("Upcoming", "channel-upcoming", "@upcoming", null, "upcoming"),
      streamItem("Completed", "channel-completed", "@completed", null, "recent"),
      milestoneItem("Milestone", "channel-milestone"),
    ];

    expect(buildTimelineKindCounts(categorized)).toEqual({
      live: 2,
      upcoming: 1,
      recent: 1,
      milestone: 1,
    });
  });
});

describe("buildTimelineFilterStats", () => {
  const mizuki = channel("水樹", "@mizuki", null, "子午計畫");
  const gabu = channel("Gabu", "@gabu");
  const archive: ArchiveIndex = {
    version: "1.0.0",
    generated_at: "2026-08-24T00:00:00Z",
    facets: "channel",
    months: [{
      month: "2026-08",
      streams: 8,
      milestones: 3,
      by_channel: {
        mizuki: { streams: 3, milestones: 1 },
        gabu: { streams: 5, milestones: 2 },
      },
    }],
  };
  const current = [
    streamItem("水樹", "mizuki", "@mizuki", null, "live", "子午計畫"),
    streamItem("水樹", "mizuki", "@mizuki", null, "recent", "子午計畫"),
    streamItem("Gabu", "gabu", "@gabu", null, "upcoming"),
  ];

  it("scopes kind and group totals to the selected VTuber while leaving VTuber choices faceted", () => {
    const stats = buildTimelineFilterStats(
      current,
      archive,
      { mizuki, gabu },
      ["子午計畫"],
      { query: "", selectedChannelId: "mizuki", selectedKind: null, selectedGroup: null },
    );

    expect(stats.kindCounts).toEqual({ live: 1, upcoming: 0, recent: 3, milestone: 1 });
    expect(stats.groupTotalCount).toBe(5);
    expect(stats.groups.find((option) => option.value === "子午計畫")?.itemCount).toBe(5);
    expect(stats.vtubers.map(({ channelId, itemCount }) => ({ channelId, itemCount }))).toEqual([
      { channelId: "gabu", itemCount: 8 },
      { channelId: "mizuki", itemCount: 5 },
    ]);
  });

  it("applies the selected kind to the other facet counts without zeroing kind choices", () => {
    const stats = buildTimelineFilterStats(
      current,
      archive,
      { mizuki, gabu },
      ["子午計畫"],
      { query: "", selectedChannelId: null, selectedKind: "recent", selectedGroup: "子午計畫" },
    );

    expect(stats.kindCounts).toEqual({ live: 1, upcoming: 0, recent: 3, milestone: 1 });
    expect(stats.vtuberTotalCount).toBe(3);
    expect(stats.vtubers).toHaveLength(1);
    expect(stats.vtubers[0]).toMatchObject({ channelId: "mizuki", itemCount: 3 });
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
