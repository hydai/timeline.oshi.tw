import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/time";

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
