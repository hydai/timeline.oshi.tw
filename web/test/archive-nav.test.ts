import { describe, it, expect } from "vitest";
import {
  archiveTotal, archiveYearMonths, archiveYears, formatArchiveMonth, itemArchiveMonth,
  filterArchiveIndex, latestArchiveMonth, stepArchiveMonth, withPendingMilestones,
} from "@/lib/archive-nav";
import type { ArchiveIndex, Milestone, SnapshotChannel } from "@/lib/types";

/** Deliberately gappy: whole years missing, and the two kinds peak in different months. */
const index: ArchiveIndex = {
  version: "1.0.0",
  generated_at: "2026-08-22T13:00:36.141Z",
  months: [
    { month: "2026-08", streams: 266, milestones: 0 },
    { month: "2026-07", streams: 371, milestones: 2 },
    { month: "2025-12", streams: 417, milestones: 1 },
    { month: "2025-11", streams: 407, milestones: 0 },
    { month: "2024-03", streams: 354, milestones: 0 },
  ],
};

const channel: SnapshotChannel = {
  name: "水樹", handle: "@mizuki", avatar: null, group: "子午計畫",
  nationality: "TW", youtube_subs: 1, twvtuber_id: "mizuki",
};

describe("latestArchiveMonth", () => {
  it("opens history at the newest month that holds this kind", () => {
    expect(latestArchiveMonth(index, "recent")).toBe("2026-08");
  });

  it("skips months that hold none of this kind", () => {
    // 2026-08 has 266 streams but no milestones — landing there would look broken.
    expect(latestArchiveMonth(index, "milestone")).toBe("2026-07");
  });

  it("narrows to one year when asked, so picking a year lands on its newest month", () => {
    expect(latestArchiveMonth(index, "recent", "2025")).toBe("2025-12");
  });

  it("has nothing to open when the archive is empty", () => {
    expect(latestArchiveMonth({ ...index, months: [] }, "recent")).toBeNull();
  });
});

describe("archiveYears", () => {
  it("lists years oldest-first with the year's own total", () => {
    expect(archiveYears(index, "recent")).toEqual([
      { year: "2024", total: 354 },
      { year: "2025", total: 824 },
      { year: "2026", total: 637 },
    ]);
  });

  it("drops years holding none of this kind rather than offering a dead button", () => {
    expect(archiveYears(index, "milestone")).toEqual([
      { year: "2025", total: 1 },
      { year: "2026", total: 2 },
    ]);
  });
});

describe("archiveYearMonths", () => {
  it("always returns twelve cells from January, so the grid never reflows", () => {
    const cells = archiveYearMonths(index, "recent", "2025");

    expect(cells).toHaveLength(12);
    expect(cells[0]).toEqual({ month: "2025-01", label: "1月", count: 0 });
    expect(cells[11]).toEqual({ month: "2025-12", label: "12月", count: 417 });
  });

  it("counts the selected kind, not everything the month holds", () => {
    expect(archiveYearMonths(index, "milestone", "2026")[6]).toEqual({
      month: "2026-07", label: "7月", count: 2,
    });
  });
});

describe("stepArchiveMonth", () => {
  it("steps back to the previous month that has something, across the year gap", () => {
    expect(stepArchiveMonth(index, "recent", "2026-07", -1)).toBe("2025-12");
  });

  it("steps forward the same way", () => {
    expect(stepArchiveMonth(index, "recent", "2025-12", 1)).toBe("2026-07");
  });

  it("stops at the oldest month rather than wrapping", () => {
    expect(stepArchiveMonth(index, "recent", "2024-03", -1)).toBeNull();
  });

  it("stops at the newest month rather than wrapping", () => {
    expect(stepArchiveMonth(index, "recent", "2026-08", 1)).toBeNull();
  });

  it("skips months holding none of the selected kind", () => {
    expect(stepArchiveMonth(index, "milestone", "2026-07", -1)).toBe("2025-12");
  });

  it("steps from a month the archive never had, so a stale selection still moves", () => {
    expect(stepArchiveMonth(index, "recent", "2025-06", 1)).toBe("2025-11");
  });
});

describe("archiveTotal", () => {
  it("adds up the whole archive for one kind", () => {
    expect(archiveTotal(index, "recent")).toBe(1815);
    expect(archiveTotal(index, "milestone")).toBe(3);
  });
});

describe("filterArchiveIndex", () => {
  const faceted: ArchiveIndex = {
    ...index,
    facets: "channel",
    months: [
      {
        month: "2026-08",
        streams: 5,
        milestones: 1,
        by_channel: {
          mizuki: { streams: 2, milestones: 1 },
          gabu: { streams: 3, milestones: 0 },
        },
      },
      {
        month: "2026-07",
        streams: 4,
        milestones: 2,
        by_channel: {
          mizuki: { streams: 1, milestones: 0 },
          gabu: { streams: 3, milestones: 2 },
        },
      },
    ],
  };
  const channels = {
    mizuki: channel,
    gabu: { ...channel, name: "Gabu", handle: "@gabu", group: null },
  };

  it("scopes every month to the selected channel instead of keeping global totals", () => {
    const filtered = filterArchiveIndex(faceted, channels, "", "mizuki", null);

    expect(filtered.months).toEqual([
      expect.objectContaining({ month: "2026-08", streams: 2, milestones: 1 }),
      expect.objectContaining({ month: "2026-07", streams: 1, milestones: 0 }),
    ]);
    expect(archiveTotal(filtered, "recent")).toBe(3);
  });

  it("applies search and group filters to archive counts", () => {
    expect(archiveTotal(filterArchiveIndex(faceted, channels, "gab", null, null), "recent")).toBe(6);
    expect(archiveTotal(filterArchiveIndex(faceted, channels, "", null, "子午計畫"), "milestone")).toBe(1);
  });

  it("does not present unfilterable legacy totals as filtered results", () => {
    const legacy = { ...faceted, facets: undefined };

    expect(archiveTotal(filterArchiveIndex(legacy, channels, "", "mizuki", null), "recent")).toBe(0);
  });
});

describe("withPendingMilestones", () => {
  // The archive only carries milestones that have already passed, but the rail also
  // shows the ones coming up — they ride in on the current snapshot. Counted or not,
  // they are on screen, so a month cell that ignores them contradicts what it opens.
  const pending: Milestone[] = [
    { channelId: "c", type: "anniversary", date: "2026-08-28" },
    { channelId: "c", type: "anniversary", date: "2026-08-07" },
    { channelId: "c", type: "anniversary", date: "2026-09-03" },
  ];

  it("counts a milestone the archive has not reached yet", () => {
    const months = withPendingMilestones(index, pending, "2026-08-22").months;

    expect(months.find((month) => month.month === "2026-08")).toEqual({
      month: "2026-08", streams: 266, milestones: 1,
      by_channel: { c: { streams: 0, milestones: 1 } },
    });
  });

  it("leaves out the ones the archive already counts", () => {
    // 2026-08-07 is on or before the cutoff, so the index already includes it.
    expect(archiveTotal(withPendingMilestones(index, pending, "2026-08-22"), "milestone"))
      .toBe(archiveTotal(index, "milestone") + 2);
  });

  it("opens a month the archive has no row for at all", () => {
    const months = withPendingMilestones(index, pending, "2026-08-22").months;

    expect(months[0]).toEqual({
      month: "2026-09",
      streams: 0,
      milestones: 1,
      by_channel: { c: { streams: 0, milestones: 1 } },
    });
  });

  it("never touches the stream counts", () => {
    expect(archiveTotal(withPendingMilestones(index, pending, "2026-08-22"), "recent"))
      .toBe(archiveTotal(index, "recent"));
  });
});

describe("itemArchiveMonth", () => {
  it("files a finished stream by the Taipei month it ended in, as the worker does", () => {
    // 20:00Z on the last of April is 04:00 on 1 May in Taipei, and the rail heads it 5/1.
    expect(itemArchiveMonth({
      kind: "recent",
      sortAt: 0,
      channel,
      stream: {
        videoId: "v", channelId: "c", title: "t", thumbnail: null, url: "u",
        actualEnd: "2025-04-30T20:00:00Z",
      },
    })).toBe("2025-05");
  });

  it("keeps a stream that ended before Taipei midnight in its own month", () => {
    expect(itemArchiveMonth({
      kind: "recent",
      sortAt: 0,
      channel,
      stream: {
        videoId: "v", channelId: "c", title: "t", thumbnail: null, url: "u",
        actualEnd: "2025-04-30T15:59:59Z",
      },
    })).toBe("2025-04");
  });

  it("files a milestone by its date", () => {
    expect(itemArchiveMonth({
      kind: "milestone",
      sortAt: 0,
      channel,
      milestone: { channelId: "c", type: "anniversary", date: "2025-04-01" },
    })).toBe("2025-04");
  });

  it("gives no month to a stream that never ended, so it cannot land in one", () => {
    expect(itemArchiveMonth({
      kind: "recent",
      sortAt: 0,
      channel,
      stream: { videoId: "v", channelId: "c", title: "t", thumbnail: null, url: "u" },
    })).toBeNull();
  });

  it("gives no month to anything still ahead of us", () => {
    expect(itemArchiveMonth({
      kind: "upcoming",
      sortAt: 0,
      channel,
      stream: {
        videoId: "v", channelId: "c", title: "t", thumbnail: null, url: "u",
        scheduledStart: "2026-09-01T10:00:00Z",
      },
    })).toBeNull();
  });
});

describe("formatArchiveMonth", () => {
  it("reads as a date, not as a key", () => {
    expect(formatArchiveMonth("2025-04")).toBe("2025 年 4 月");
  });
});
