import { describe, it, expect } from "vitest";
import { daysUntil, debutYears, describeDaysUntil, milestoneLabel } from "@/lib/milestones";
import type { ArchiveIndex } from "@/lib/types";

const index: ArchiveIndex = {
  version: "1.0.0",
  generated_at: "2026-09-27T00:00:00Z",
  facets: "channel",
  months: [
    { month: "2026-10", streams: 0, milestones: 1, by_channel: { hitomi: { streams: 0, milestones: 1 } } },
    { month: "2025-10", streams: 9, milestones: 1, by_channel: { hitomi: { streams: 8, milestones: 1 }, rei: { streams: 1, milestones: 0 } } },
    { month: "2024-02", streams: 3, milestones: 1, by_channel: { rei: { streams: 3, milestones: 1 } } },
  ],
};

describe("debutYears", () => {
  it("takes each channel's debut from its earliest month with a milestone", () => {
    // A channel's first milestone is its debut; streams alone say nothing about it.
    expect(debutYears(index)).toEqual(new Map([["hitomi", 2025], ["rei", 2024]]));
  });

  it("knows nothing without per-channel counts", () => {
    expect(debutYears({ ...index, facets: undefined, months: index.months.map(({ by_channel: _, ...month }) => month) }).size).toBe(0);
    expect(debutYears(null).size).toBe(0);
  });
});

describe("milestoneLabel", () => {
  it("counts which anniversary it is from the debut year", () => {
    expect(milestoneLabel({ channelId: "hitomi", type: "anniversary", date: "2026-10-06" }, 2025)).toBe("出道 1 週年");
    expect(milestoneLabel({ channelId: "rei", type: "anniversary", date: "2028-02-11" }, 2024)).toBe("出道 4 週年");
  });

  it("falls back to a plain anniversary when the debut year is unknown or makes no sense", () => {
    expect(milestoneLabel({ channelId: "x", type: "anniversary", date: "2026-10-06" }, undefined)).toBe("出道週年");
    expect(milestoneLabel({ channelId: "x", type: "anniversary", date: "2026-10-06" }, 2026)).toBe("出道週年");
  });

  it("names debuts and graduations", () => {
    expect(milestoneLabel({ channelId: "x", type: "debut", date: "2026-09-20" }, 2026)).toBe("出道");
    expect(milestoneLabel({ channelId: "x", type: "graduate", date: "2026-09-20" }, 2021)).toBe("畢業");
  });
});

describe("daysUntil", () => {
  // 2026-09-27 22:00 in Taipei.
  const NOW = Date.parse("2026-09-27T14:00:00Z");

  it("counts whole Taipei calendar days", () => {
    expect(daysUntil("2026-09-27", NOW)).toBe(0);
    expect(daysUntil("2026-09-28", NOW)).toBe(1);
    expect(daysUntil("2026-10-03", NOW)).toBe(6);
    expect(daysUntil("2026-09-26", NOW)).toBe(-1);
  });

  it("turns the day at Taipei midnight, not UTC midnight", () => {
    // 2026-09-28 01:00 in Taipei, still 9/27 in UTC.
    expect(daysUntil("2026-09-28", Date.parse("2026-09-27T17:00:00Z"))).toBe(0);
  });
});

describe("describeDaysUntil", () => {
  it("reads like a countdown", () => {
    expect(describeDaysUntil(0)).toBe("今天");
    expect(describeDaysUntil(1)).toBe("明天");
    expect(describeDaysUntil(6)).toBe("還有 6 天");
  });
});
