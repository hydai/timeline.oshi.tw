import { describe, it, expect } from "vitest";
import { normalizeChannel } from "../src/youtube";
import type { YtChannelItem } from "../src/youtube";

const item: YtChannelItem = {
  id: "UCaaa",
  snippet: { title: "水樹", thumbnails: { medium: { url: "https://av/med" } } },
  contentDetails: { relatedPlaylists: { uploads: "UUaaa" } },
};

describe("normalizeChannel", () => {
  it("extracts name, avatar, uploads playlist", () => {
    const m = normalizeChannel(item);
    expect(m).toEqual({ channelId: "UCaaa", name: "水樹", avatarUrl: "https://av/med", uploadsPlaylist: "UUaaa" });
  });

  it("falls back to derived uploads id when contentDetails missing", () => {
    const m = normalizeChannel({ id: "UCbbb", snippet: { title: "x", thumbnails: {} } });
    expect(m.uploadsPlaylist).toBe("UUbbb");
    expect(m.avatarUrl).toBe("");
  });
});
