import { describe, it, expect } from "vitest";
import { formatClock, formatDayHeading, formatRelativeTime, taipeiDayKey } from "@/lib/time";

const now = Date.parse("2026-07-21T12:00:00Z");

describe("formatRelativeTime", () => {
  it("just now for < 1 min either side", () => {
    expect(formatRelativeTime("2026-07-21T12:00:30Z", now)).toBe("剛剛");
    expect(formatRelativeTime("2026-07-21T11:59:40Z", now)).toBe("剛剛");
  });
  it("minutes future/past", () => {
    expect(formatRelativeTime("2026-07-21T12:05:00Z", now)).toBe("5 分鐘後");
    expect(formatRelativeTime("2026-07-21T11:40:00Z", now)).toBe("20 分鐘前");
  });
  it("hours", () => {
    expect(formatRelativeTime("2026-07-21T15:00:00Z", now)).toBe("3 小時後");
    expect(formatRelativeTime("2026-07-21T09:00:00Z", now)).toBe("3 小時前");
  });
  it("days", () => {
    expect(formatRelativeTime("2026-07-19T12:00:00Z", now)).toBe("2 天前");
  });
  it("empty string for invalid input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});

describe("taipeiDayKey", () => {
  it("shifts UTC into the Asia/Taipei calendar day", () => {
    // 20:00Z on 8/21 is already 04:00 on 8/22 in Taipei
    expect(taipeiDayKey("2026-08-21T20:00:00Z")).toBe("2026-08-22");
  });
  it("keeps the last minute before Taipei midnight on the same day", () => {
    expect(taipeiDayKey("2026-08-22T15:59:00Z")).toBe("2026-08-22");
  });
  it("rolls over at Taipei midnight", () => {
    expect(taipeiDayKey("2026-08-22T16:00:00Z")).toBe("2026-08-23");
  });
  it("returns empty string for invalid input", () => {
    expect(taipeiDayKey("not-a-date")).toBe("");
  });
});

describe("formatClock", () => {
  it("renders 24-hour Taipei wall time", () => {
    expect(formatClock("2026-08-22T12:40:00Z")).toBe("20:40");
  });
  it("pads midnight", () => {
    expect(formatClock("2026-08-21T16:00:00Z")).toBe("00:00");
  });
  it("returns empty string for invalid input", () => {
    expect(formatClock("not-a-date")).toBe("");
  });
});

describe("formatDayHeading", () => {
  // 2026-08-22T12:40:00Z === 8/22 20:40 in Taipei
  const nowTaipei = Date.parse("2026-08-22T12:40:00Z");

  it("labels the current Taipei day 今天", () => {
    expect(formatDayHeading("2026-08-22", nowTaipei)).toEqual({ title: "今天", date: "8/22 週六" });
  });
  it("labels the next Taipei day 明天", () => {
    expect(formatDayHeading("2026-08-23", nowTaipei)).toEqual({ title: "明天", date: "8/23 週日" });
  });
  it("labels any other day by date, with the weekday as the subtitle", () => {
    expect(formatDayHeading("2026-08-29", nowTaipei)).toEqual({ title: "8/29", date: "週六" });
  });
  it("labels a past day by date too", () => {
    expect(formatDayHeading("2026-08-20", nowTaipei)).toEqual({ title: "8/20", date: "週四" });
  });
});
