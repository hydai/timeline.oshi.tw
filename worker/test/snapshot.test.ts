import { describe, it, expect } from "vitest";
import { buildSnapshot } from "../src/snapshot";
import type { ChannelRow, StreamRecord, RosterEntry } from "../src/types";

const channelRow: ChannelRow = {
  channel_id: "UCaaa", handle: "@mizuki", name: "水樹(cache)", avatar_url: "https://av",
  uploads_playlist: "UUaaa", enabled: 1, added_at: "2026-07-01T00:00:00Z", meta_checked_at: null,
};
const roster = new Map<string, RosterEntry>([
  ["UCaaa", { youtubeId: "UCaaa", name: "水樹", group: "子午計畫", nationality: "TW", youtubeSubs: 207000, avatar: "https://tw", twvtuberId: "tw1" }],
]);
const mkStream = (o: Partial<StreamRecord> & Pick<StreamRecord, "videoId" | "status">): StreamRecord => ({
  channelId: "UCaaa", title: "t", thumbnailUrl: "https://th", scheduledStart: null,
  actualStart: null, actualEnd: null, concurrentViewers: null, ...o,
});

describe("buildSnapshot", () => {
  const now = "2026-07-21T00:00:00Z";

  it("enriches channels from roster and derives groups", () => {
    const snap = buildSnapshot({ channels: [channelRow], streams: [], roster, milestones: [], nowIso: now, heavyRefreshedAtIso: now });
    expect(snap.version).toBe("1.0.0");
    expect(snap.channels["UCaaa"]).toEqual({
      name: "水樹(cache)", handle: "@mizuki", avatar: "https://av", group: "子午計畫",
      nationality: "TW", youtube_subs: 207000, twvtuber_id: "tw1",
    });
    expect(snap.groups).toEqual(["子午計畫"]);
  });

  it("falls back through the full name/avatar precedence chain when row fields are null", () => {
    const rowWithoutName: ChannelRow = { ...channelRow, name: null, avatar_url: null };

    const withRoster = buildSnapshot({
      channels: [rowWithoutName], streams: [], roster, milestones: [], nowIso: now, heavyRefreshedAtIso: now,
    });
    expect(withRoster.channels["UCaaa"]).toMatchObject({ name: "水樹", avatar: "https://tw" });

    const withoutRoster = buildSnapshot({
      channels: [rowWithoutName], streams: [], roster: new Map(), milestones: [], nowIso: now, heavyRefreshedAtIso: now,
    });
    expect(withoutRoster.channels["UCaaa"]).toMatchObject({ name: "UCaaa", avatar: null });
  });

  it("sorts streams into lanes with youtube urls", () => {
    const snap = buildSnapshot({
      channels: [channelRow],
      streams: [
        mkStream({ videoId: "L", status: "live", actualStart: "2026-07-21T00:00:00Z", concurrentViewers: 5 }),
        mkStream({ videoId: "U", status: "upcoming", scheduledStart: "2026-07-22T00:00:00Z" }),
      ],
      roster, milestones: [], nowIso: now, heavyRefreshedAtIso: now,
    });
    expect(snap.live[0]).toMatchObject({ videoId: "L", url: "https://www.youtube.com/watch?v=L", concurrentViewers: 5 });
    expect(snap.upcoming[0]).toMatchObject({ videoId: "U", scheduledStart: "2026-07-22T00:00:00Z" });
    expect(snap.live[0]!.scheduledStart).toBeUndefined();
  });

  it("keeps only ended streams within the last 7 days in recent", () => {
    const snap = buildSnapshot({
      channels: [channelRow],
      streams: [
        mkStream({ videoId: "fresh", status: "ended", actualEnd: "2026-07-20T00:00:00Z" }),
        mkStream({ videoId: "old", status: "ended", actualEnd: "2026-07-10T00:00:00Z" }),
      ],
      roster, milestones: [], nowIso: now, heavyRefreshedAtIso: now,
    });
    expect(snap.recent.map((s) => s.videoId)).toEqual(["fresh"]);
  });

  it("drops streams whose channel is not tracked", () => {
    const snap = buildSnapshot({
      channels: [channelRow],
      streams: [mkStream({ videoId: "ghost", status: "live", channelId: "UCother" })],
      roster, milestones: [], nowIso: now, heavyRefreshedAtIso: now,
    });
    expect(snap.live).toEqual([]);
  });
});
