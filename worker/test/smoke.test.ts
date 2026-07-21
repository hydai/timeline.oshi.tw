import { describe, it, expect } from "vitest";
import type { Snapshot } from "../src/types";

describe("scaffold", () => {
  it("snapshot version type is 1.0.0", () => {
    const v: Snapshot["version"] = "1.0.0";
    expect(v).toBe("1.0.0");
  });
});
