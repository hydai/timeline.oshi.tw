import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { writeSnapshot, readSnapshot, SNAPSHOT_KEY } from "../src/r2";
import type { Snapshot } from "../src/types";

const snap: Snapshot = {
  version: "1.0.0", generated_at: "2026-07-21T00:00:00Z", heavy_refreshed_at: "2026-07-21T00:00:00Z",
  channels: {}, groups: [], live: [], upcoming: [], recent: [], milestones: [],
};

beforeEach(async () => {
  await env.DATA_PUBLIC.delete(SNAPSHOT_KEY);
});

describe("r2 snapshot io", () => {
  it("writes under the streams/ prefix with cache-control", async () => {
    await writeSnapshot(env.DATA_PUBLIC, snap);
    expect(SNAPSHOT_KEY).toBe("streams/v1/snapshot.json");
    const obj = await env.DATA_PUBLIC.get(SNAPSHOT_KEY);
    expect(obj).not.toBeNull();
    expect(obj!.httpMetadata?.cacheControl).toBe("public, max-age=300, stale-if-error=86400");
    expect(obj!.httpMetadata?.contentType).toBe("application/json");
  });

  it("round-trips via readSnapshot", async () => {
    await writeSnapshot(env.DATA_PUBLIC, snap);
    expect(await readSnapshot(env.DATA_PUBLIC)).toEqual(snap);
  });

  it("readSnapshot returns null when absent", async () => {
    expect(await readSnapshot(env.DATA_PUBLIC)).toBeNull();
  });
});
