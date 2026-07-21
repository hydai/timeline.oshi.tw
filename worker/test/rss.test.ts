import { describe, it, expect } from "vitest";
import { extractVideoIds } from "../src/rss";
import { sampleFeed } from "./fixtures/rss";

describe("extractVideoIds", () => {
  it("extracts video ids in document order", () => {
    expect(extractVideoIds(sampleFeed)).toEqual(["abc123DEF-_", "xyz789GHI"]);
  });

  it("returns empty array for feed with no entries", () => {
    expect(extractVideoIds("<feed></feed>")).toEqual([]);
  });
});
