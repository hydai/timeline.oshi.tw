import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { listEnabledChannels, upsertChannelId, setChannelMeta, getStaleChannels } from "../src/db";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM channels");
});

describe("channels db", () => {
  it("upserts an id then lists it as enabled", async () => {
    await upsertChannelId(env.DB, "UCaaa", "2026-07-21T00:00:00Z");
    const rows = await listEnabledChannels(env.DB);
    expect(rows.map((r) => r.channel_id)).toEqual(["UCaaa"]);
    expect(rows[0]!.enabled).toBe(1);
  });

  it("upsert is idempotent and preserves added_at", async () => {
    await upsertChannelId(env.DB, "UCaaa", "2026-07-21T00:00:00Z");
    await upsertChannelId(env.DB, "UCaaa", "2026-07-22T00:00:00Z");
    const rows = await listEnabledChannels(env.DB);
    expect(rows.length).toBe(1);
    expect(rows[0]!.added_at).toBe("2026-07-21T00:00:00Z");
  });

  it("setChannelMeta writes name/avatar/uploads and marks meta_checked_at", async () => {
    await upsertChannelId(env.DB, "UCaaa", "2026-07-21T00:00:00Z");
    await setChannelMeta(
      env.DB,
      { channelId: "UCaaa", name: "水樹", avatarUrl: "https://a", uploadsPlaylist: "UUaaa" },
      "2026-07-21T01:00:00Z",
    );
    const [row] = await listEnabledChannels(env.DB);
    expect(row!.name).toBe("水樹");
    expect(row!.uploads_playlist).toBe("UUaaa");
    expect(row!.meta_checked_at).toBe("2026-07-21T01:00:00Z");
  });

  it("getStaleChannels returns channels whose meta_checked_at is null or older", async () => {
    await upsertChannelId(env.DB, "UCold", "2026-07-21T00:00:00Z");
    const stale = await getStaleChannels(env.DB, "2026-07-21T00:00:00Z");
    expect(stale.map((r) => r.channel_id)).toContain("UCold");
  });
});
