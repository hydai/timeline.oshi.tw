import { describe, it, expect } from "vitest";
import { normalizeVideo, uploadsPlaylistId } from "../src/youtube";
import { liveItem, upcomingItem, endedItem, plainUpload } from "./fixtures/videos";

describe("normalizeVideo", () => {
  it("maps a live stream", () => {
    const r = normalizeVideo(liveItem);
    expect(r.status).toBe("live");
    expect(r.actualStart).toBe("2026-07-21T14:00:00Z");
    expect(r.concurrentViewers).toBe(321);
    expect(r.thumbnailUrl).toBe("https://thumb/med");
  });

  it("maps an upcoming stream with scheduledStart", () => {
    const r = normalizeVideo(upcomingItem);
    expect(r.status).toBe("upcoming");
    expect(r.scheduledStart).toBe("2026-07-22T12:00:00Z");
    expect(r.concurrentViewers).toBeNull();
  });

  it("maps an ended live broadcast", () => {
    const r = normalizeVideo(endedItem);
    expect(r.status).toBe("ended");
    expect(r.actualEnd).toBe("2026-07-20T12:00:00Z");
  });

  it("treats a non-live upload as ended", () => {
    expect(normalizeVideo(plainUpload).status).toBe("ended");
  });

  it("derives uploads playlist id", () => {
    expect(uploadsPlaylistId("UCabc")).toBe("UUabc");
  });
});
