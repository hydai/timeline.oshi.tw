import { describe, it, expect } from "vitest";
import { filterTimeline } from "@/lib/filter";
import type { TimelineItem } from "@/lib/types";

const item = (name: string, group: string | null): TimelineItem => ({
  kind: "recent", sortAt: 0,
  stream: { videoId: "v", channelId: "c", title: "t", thumbnail: null, url: "u" },
  channel: { name, handle: "@" + name, avatar: null, group, nationality: "TW", youtube_subs: 1, twvtuber_id: "t" },
});

const items = [item("水樹", "子午計畫"), item("Gabu", "獨立"), item("森森鈴蘭", "箱箱The Box")];

describe("filterTimeline", () => {
  it("no filters returns all", () => {
    expect(filterTimeline(items, "", []).length).toBe(3);
  });
  it("name substring, case-insensitive", () => {
    expect(filterTimeline(items, "gab", []).map((i) => i.channel.name)).toEqual(["Gabu"]);
  });
  it("matches handle too", () => {
    expect(filterTimeline(items, "@水樹", []).map((i) => i.channel.name)).toEqual(["水樹"]);
  });
  it("group multi-select", () => {
    expect(filterTimeline(items, "", ["子午計畫", "獨立"]).map((i) => i.channel.name)).toEqual(["水樹", "Gabu"]);
  });
  it("name AND group together", () => {
    expect(filterTimeline(items, "森", ["子午計畫"]).length).toBe(0);
    expect(filterTimeline(items, "森", ["箱箱The Box"]).map((i) => i.channel.name)).toEqual(["森森鈴蘭"]);
  });
});
