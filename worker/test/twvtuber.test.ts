import { describe, it, expect } from "vitest";
import { indexRosterByYoutubeId, toMilestone } from "../src/twvtuber";
import { vtubers } from "./fixtures/twvtuber";

describe("indexRosterByYoutubeId", () => {
  it("indexes only entries with a youtube_id", () => {
    const map = indexRosterByYoutubeId(vtubers);
    expect([...map.keys()]).toEqual(["UCaaa"]);
    expect(map.get("UCaaa")).toEqual({
      youtubeId: "UCaaa", name: "水樹", group: "子午計畫", nationality: "TW",
      youtubeSubs: 207000, avatar: "https://img/1", twvtuberId: "tw1",
    });
  });
});

describe("toMilestone", () => {
  it("uses this-year MM-DD for anniversary", () => {
    const m = toMilestone(vtubers[0]!, "anniversary", "2026-07-21T00:00:00Z");
    expect(m).toEqual({ channelId: "UCaaa", type: "anniversary", date: "2026-10-31" });
  });

  it("uses debut_date for debut", () => {
    expect(toMilestone(vtubers[0]!, "debut", "2026-07-21T00:00:00Z")!.date).toBe("2021-10-31");
  });

  it("returns null when required date missing", () => {
    expect(toMilestone(vtubers[1]!, "debut", "2026-07-21T00:00:00Z")).toBeNull();
  });
});
