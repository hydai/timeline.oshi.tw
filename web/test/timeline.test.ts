import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/timeline";
import type { Snapshot } from "@/lib/types";
import fixture from "./fixtures/snapshot.json";

const ch = (name: string) => ({ name, handle: null, avatar: null, group: "G", nationality: "TW", youtube_subs: 1, twvtuber_id: "t" });

const mini: Snapshot = {
  version: "1.0.0", generated_at: "", heavy_refreshed_at: "",
  channels: { A: ch("A"), B: ch("B"), C: ch("C"), D: ch("D"), E: ch("E") },
  groups: ["G"],
  live: [{ videoId: "L", channelId: "A", title: "l", thumbnail: null, url: "u", actualStart: "2026-07-21T10:00:00Z", concurrentViewers: 50 }],
  upcoming: [
    { videoId: "U2", channelId: "B", title: "later", thumbnail: null, url: "u", scheduledStart: "2026-07-22T00:00:00Z" },
    { videoId: "U1", channelId: "C", title: "soon", thumbnail: null, url: "u", scheduledStart: "2026-07-21T13:00:00Z" },
    { videoId: "U0", channelId: "D", title: "untimed", thumbnail: null, url: "u" },
  ],
  recent: [{ videoId: "R", channelId: "E", title: "r", thumbnail: null, url: "u", actualEnd: "2026-07-21T09:00:00Z" }],
  milestones: [{ channelId: "A", type: "anniversary", date: "2026-07-20" }],
};

describe("buildTimeline", () => {
  it("orders live → upcoming(soonest, untimed last) → recent+milestones(newest)", () => {
    const ids = buildTimeline(mini).map((it) => (it.kind === "milestone" ? `M:${it.milestone.channelId}` : it.stream.videoId));
    expect(ids).toEqual(["L", "U1", "U2", "U0", "R", "M:A"]);
  });

  it("drops items whose channel is absent", () => {
    const orphan: Snapshot = { ...mini, live: [{ videoId: "X", channelId: "ZZ", title: "x", thumbnail: null, url: "u" }], upcoming: [], recent: [], milestones: [] };
    expect(buildTimeline(orphan)).toEqual([]);
  });

  it("handles the real fixture without throwing and resolves channels", () => {
    const items = buildTimeline(fixture as Snapshot);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((it) => it.channel && typeof it.channel.name === "string")).toBe(true);
    expect(items[0]!.kind).toBe("live");
  });
});
