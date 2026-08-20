import { afterEach, describe, expect, it, vi } from "vitest";
import { derivePermanentMilestones, fetchRoster, indexRosterByYoutubeId } from "../src/twvtuber";
import { vtubers } from "./fixtures/twvtuber";

afterEach(() => vi.restoreAllMocks());

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

describe("derivePermanentMilestones", () => {
  it("backfills debut and every anniversary through next year", () => {
    const milestones = derivePermanentMilestones(vtubers, new Set(["UCaaa"]), "2026-07-21T00:00:00Z");
    expect(milestones).toEqual([
      { channelId: "UCaaa", type: "debut", date: "2021-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2022-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2023-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2024-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2025-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2026-10-31" },
      { channelId: "UCaaa", type: "anniversary", date: "2027-10-31" },
    ]);
  });

  it("records graduation and stops anniversaries after graduation", () => {
    const graduated = { ...vtubers[0]!, graduate_date: "2024-06-01" };
    const milestones = derivePermanentMilestones([graduated], new Set(["UCaaa"]), "2026-07-21T00:00:00Z");
    expect(milestones.map((milestone) => `${milestone.type}:${milestone.date}`)).toEqual([
      "debut:2021-10-31",
      "anniversary:2022-10-31",
      "anniversary:2023-10-31",
      "graduate:2024-06-01",
    ]);
  });

  it("ignores untracked or dateless roster entries", () => {
    expect(derivePermanentMilestones(vtubers, new Set(["UCother"]), "2026-07-21T00:00:00Z")).toEqual([]);
  });
});

describe("fetchRoster", () => {
  it("requests the complete roster without filtering out graduated channels", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: vtubers }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchRoster("https://twvtuber.example")).toEqual(vtubers);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://twvtuber.example/v1/vtubers?region=TW&limit=100&offset=0",
    );
  });
});
