import { describe, it, expect } from "vitest";
import { buildRail, railTime } from "@/lib/rail";
import type { SnapshotChannel, TimelineItem } from "@/lib/types";

const channel: SnapshotChannel = {
  name: "水樹",
  handle: null,
  avatar: null,
  group: "子午計畫",
  nationality: "TW",
  youtube_subs: 1,
  twvtuber_id: "t",
};

// 2026-08-22T12:40:00Z === 8/22 20:40 in Taipei
const NOW = Date.parse("2026-08-22T12:40:00Z");

function stream(
  kind: "live" | "upcoming" | "recent",
  videoId: string,
  times: { actualStart?: string; scheduledStart?: string; actualEnd?: string },
): TimelineItem {
  return {
    kind,
    sortAt: 0,
    channel,
    stream: { videoId, channelId: "c", title: videoId, thumbnail: null, url: "u", ...times },
  } as TimelineItem;
}

function milestone(date: string): TimelineItem {
  return {
    kind: "milestone",
    sortAt: 0,
    channel,
    milestone: { channelId: "c", type: "anniversary", date },
  };
}

const finishedToday = stream("recent", "finished", {
  actualStart: "2026-08-22T05:00:00Z", // 13:00
  actualEnd: "2026-08-22T06:00:00Z",
});
const liveNow = stream("live", "live", { actualStart: "2026-08-22T11:50:00Z" }); // 19:50
const laterToday = stream("upcoming", "later", { scheduledStart: "2026-08-22T13:00:00Z" }); // 21:00
const tomorrow = stream("upcoming", "tomorrow", { scheduledStart: "2026-08-23T13:00:00Z" });
const nextWeek = stream("upcoming", "next-week", { scheduledStart: "2026-08-28T12:00:00Z" });
const oldStream = stream("recent", "old", {
  actualStart: "2026-08-20T05:00:00Z",
  actualEnd: "2026-08-20T06:00:00Z",
});

const types = (rows: ReturnType<typeof buildRail>) => rows.map((row) => row.type);

describe("railTime", () => {
  it("anchors a stream at its start, not its end", () => {
    expect(railTime(finishedToday)).toBe(Date.parse("2026-08-22T05:00:00Z"));
  });
  it("uses the scheduled start for an upcoming stream", () => {
    expect(railTime(laterToday)).toBe(Date.parse("2026-08-22T13:00:00Z"));
  });
  it("falls back to the end time when a finished stream has no start", () => {
    const noStart = stream("recent", "no-start", { actualEnd: "2026-08-22T06:00:00Z" });
    expect(railTime(noStart)).toBe(Date.parse("2026-08-22T06:00:00Z"));
  });
});

describe("buildRail — forward mode", () => {
  it("places a live stream above the now marker, because it started before now", () => {
    const rows = buildRail([liveNow, laterToday], NOW, "forward");
    const nowIndex = rows.findIndex((row) => row.type === "now");
    const liveIndex = rows.findIndex((row) => row.type === "item" && row.item === liveNow);
    const laterIndex = rows.findIndex((row) => row.type === "item" && row.item === laterToday);

    expect(liveIndex).toBeLessThan(nowIndex);
    expect(nowIndex).toBeLessThan(laterIndex);
  });

  it("orders every item row by ascending wall-clock time", () => {
    const rows = buildRail([laterToday, liveNow, tomorrow], NOW, "forward");
    const clocks = rows.flatMap((row) => (row.type === "item" ? [railTime(row.item)] : []));

    expect(clocks).toEqual([...clocks].sort((a, b) => a - b));
  });

  it("emits one day divider per Taipei day", () => {
    const rows = buildRail([liveNow, tomorrow], NOW, "forward");
    const days = rows.flatMap((row) => (row.type === "day" ? [row.dayKey] : []));

    expect(days).toEqual(["2026-08-22", "2026-08-23"]);
  });

  it("flags which day divider is today, so the rail can mark the present", () => {
    const rows = buildRail([liveNow, tomorrow], NOW, "forward");
    const days = rows.flatMap((row) => (row.type === "day" ? [{ key: row.dayKey, isToday: row.isToday }] : []));

    expect(days).toEqual([
      { key: "2026-08-22", isToday: true },
      { key: "2026-08-23", isToday: false },
    ]);
  });

  it("folds streams that already finished today into a single row", () => {
    const rows = buildRail([finishedToday, liveNow], NOW, "forward");
    const fold = rows.find((row) => row.type === "fold");

    expect(fold).toMatchObject({ count: 1, clock: "13:00" });
    expect(rows.some((row) => row.type === "item" && row.item === finishedToday)).toBe(false);
  });

  it("keeps a live stream that started before midnight on today's rail", () => {
    // 8/21 22:00 in Taipei — yesterday's calendar day, but still on air right now.
    const overnight = stream("live", "overnight", { actualStart: "2026-08-21T14:00:00Z" });
    const rows = buildRail([overnight], NOW, "forward");
    const dayIndex = rows.findIndex((row) => row.type === "day");
    const itemIndex = rows.findIndex((row) => row.type === "item" && row.item === overnight);
    const nowIndex = rows.findIndex((row) => row.type === "now");

    expect(rows[dayIndex]).toMatchObject({ dayKey: "2026-08-22" });
    expect(itemIndex).toBeGreaterThan(dayIndex);
    expect(itemIndex).toBeLessThan(nowIndex);
  });

  it("keeps an overdue upcoming stream rather than silently dropping it", () => {
    const overdue = stream("upcoming", "overdue", { scheduledStart: "2026-08-21T14:00:00Z" });
    const rows = buildRail([overdue], NOW, "forward");

    expect(rows.some((row) => row.type === "item" && row.item === overdue)).toBe(true);
  });

  it("leaves the clock empty when a stream has no announced time", () => {
    const undated = stream("upcoming", "undated", {});
    const rows = buildRail([undated], NOW, "forward");
    const item = rows.find((row) => row.type === "item");

    expect(item).toMatchObject({ clock: "" });
  });

  it("sorts a stream with no announced time after everything scheduled today", () => {
    const undated = stream("upcoming", "undated", {});
    const rows = buildRail([undated, laterToday], NOW, "forward");
    const undatedIndex = rows.findIndex((row) => row.type === "item" && row.item === undated);
    const laterIndex = rows.findIndex((row) => row.type === "item" && row.item === laterToday);
    const nowIndex = rows.findIndex((row) => row.type === "now");

    expect(nowIndex).toBeLessThan(laterIndex);
    expect(laterIndex).toBeLessThan(undatedIndex);
  });

  it("drops days that are already over", () => {
    const rows = buildRail([oldStream, liveNow], NOW, "forward");

    expect(rows.some((row) => row.type === "item" && row.item === oldStream)).toBe(false);
    expect(rows.flatMap((row) => (row.type === "day" ? [row.dayKey] : []))).toEqual(["2026-08-22"]);
  });

  it("collapses a run of empty days into one gap row", () => {
    const rows = buildRail([tomorrow, nextWeek], NOW, "forward");
    const gap = rows.find((row) => row.type === "gap");

    expect(gap).toMatchObject({ from: "2026-08-24", to: "2026-08-27", days: 4 });
  });

  it("emits no gap row between adjacent days", () => {
    const rows = buildRail([liveNow, tomorrow], NOW, "forward");

    expect(types(rows)).not.toContain("gap");
  });

  it("still shows today and the now marker when nothing is scheduled", () => {
    const rows = buildRail([], NOW, "forward");

    expect(rows.find((row) => row.type === "day")).toMatchObject({ dayKey: "2026-08-22" });
    expect(rows.find((row) => row.type === "now")).toMatchObject({ clock: "20:40", liveCount: 0 });
  });

  it("counts the live streams on the now marker", () => {
    const rows = buildRail([liveNow, laterToday], NOW, "forward");

    expect(rows.find((row) => row.type === "now")).toMatchObject({ liveCount: 1 });
  });

  it("gives a milestone no clock, since it is a dated all-day event", () => {
    const rows = buildRail([milestone("2026-08-29")], NOW, "forward");
    const item = rows.find((row) => row.type === "item");

    expect(item).toMatchObject({ clock: "" });
  });

  it("ends with a tail row so the rail terminates", () => {
    const rows = buildRail([liveNow], NOW, "forward");

    expect(rows.at(-1)).toMatchObject({ type: "tail" });
  });
});

describe("buildRail — history mode", () => {
  it("orders item rows newest first", () => {
    const rows = buildRail([oldStream, finishedToday], NOW, "history");
    const clocks = rows.flatMap((row) => (row.type === "item" ? [railTime(row.item)] : []));

    expect(clocks).toEqual([...clocks].sort((a, b) => b - a));
  });

  it("keeps days that are already over", () => {
    const rows = buildRail([oldStream], NOW, "history");

    expect(rows.some((row) => row.type === "item" && row.item === oldStream)).toBe(true);
  });

  it("has no now marker, no fold row and no gap rows", () => {
    const rows = buildRail([oldStream, finishedToday, liveNow], NOW, "history");

    expect(types(rows)).not.toContain("now");
    expect(types(rows)).not.toContain("fold");
    expect(types(rows)).not.toContain("gap");
  });

  it("returns nothing at all when there are no items", () => {
    expect(buildRail([], NOW, "history")).toEqual([]);
  });
});
