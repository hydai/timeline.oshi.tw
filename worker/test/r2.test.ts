import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  ARCHIVE_INDEX_KEY, SNAPSHOT_KEY, archiveMonthKey, readArchiveIndex, readSnapshot,
  writeArchiveIndex, writeArchiveMonth, writeSnapshot,
} from "../src/r2";
import type { ArchiveIndex, ArchiveMonth, Snapshot } from "../src/types";

const snap: Snapshot = {
  version: "1.0.0", generated_at: "2026-07-21T00:00:00Z", heavy_refreshed_at: "2026-07-21T00:00:00Z",
  channels: {}, groups: [], live: [], upcoming: [], recent: [], milestones: [],
};

beforeEach(async () => {
  await env.DATA_PUBLIC.delete([SNAPSHOT_KEY, ARCHIVE_INDEX_KEY, archiveMonthKey("2024-03")]);
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

  it("writes and reads the permanent archive index and monthly payload", async () => {
    const index: ArchiveIndex = {
      version: "1.0.0",
      generated_at: "2026-07-21T00:00:00Z",
      months: [{ month: "2024-03", streams: 1, milestones: 2 }],
    };
    const month: ArchiveMonth = {
      version: "1.0.0",
      generated_at: "2026-07-21T00:00:00Z",
      month: "2024-03",
      channels: {},
      streams: [],
      milestones: [],
    };

    await writeArchiveMonth(env.DATA_PUBLIC, month);
    await writeArchiveIndex(env.DATA_PUBLIC, index);

    expect(ARCHIVE_INDEX_KEY).toBe("streams/v1/archive/index.json");
    expect(archiveMonthKey("2024-03")).toBe("streams/v1/archive/2024-03.json");
    expect(await readArchiveIndex(env.DATA_PUBLIC)).toEqual(index);
    expect(await (await env.DATA_PUBLIC.get(archiveMonthKey("2024-03")))!.json()).toEqual(month);
  });

  it("rejects malformed archive month keys", () => {
    expect(() => archiveMonthKey("2024-13")).toThrow(/invalid archive month/);
  });
});
