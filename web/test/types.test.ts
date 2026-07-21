import { describe, it, expect } from "vitest";
import type { Snapshot } from "@/lib/types";
import fixture from "./fixtures/snapshot.json";

describe("Snapshot types", () => {
  it("the real fixture conforms to the Snapshot type", () => {
    const snap: Snapshot = fixture as Snapshot;
    expect(snap.version).toBe("1.0.0");
    const firstLive = snap.live[0]!;
    expect(typeof firstLive.videoId).toBe("string");
    expect(snap.channels[firstLive.channelId]).toBeDefined();
  });
});
