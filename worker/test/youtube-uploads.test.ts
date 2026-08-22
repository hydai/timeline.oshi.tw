import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchUploadIds, uploadsPlaylistId } from "../src/youtube";

afterEach(() => vi.restoreAllMocks());

function page(ids: string[], nextPageToken?: string) {
  return new Response(JSON.stringify({
    items: ids.map((id) => ({ contentDetails: { videoId: id } })),
    ...(nextPageToken ? { nextPageToken } : {}),
  }), { status: 200 });
}

describe("uploadsPlaylistId", () => {
  it("derives the uploads playlist from the channel id", () => {
    expect(uploadsPlaylistId("UCjv4bfP_67WLuPheS-Z8Ekg")).toBe("UUjv4bfP_67WLuPheS-Z8Ekg");
  });
});

describe("fetchUploadIds", () => {
  it("pages through the whole upload history in order", async () => {
    const fetchMock = vi.fn(async (_url: string) => page([]))
      .mockResolvedValueOnce(page(["a", "b"], "TOKEN2"))
      .mockResolvedValueOnce(page(["c"]));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchUploadIds("key", "ref", "UUx")).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks playlistItems for 50 at a time — 1 quota unit a page, never search.list", async () => {
    const fetchMock = vi.fn(async (_url: string) => page(["a"]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUploadIds("key", "ref", "UUx");

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/playlistItems");
    expect(url).not.toContain("/search");
    expect(url).toContain("maxResults=50");
    expect(url).toContain("part=contentDetails");
  });

  it("carries the page token forward", async () => {
    const fetchMock = vi.fn(async (_url: string) => page([]))
      .mockResolvedValueOnce(page(["a"], "TOKEN2"))
      .mockResolvedValueOnce(page(["b"]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUploadIds("key", "ref", "UUx");

    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("pageToken=");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("pageToken=TOKEN2");
  });

  it("stops at maxPages so one channel can never burn the day's quota", async () => {
    const fetchMock = vi.fn(async (_url: string) => page(["x"], "MORE"));
    vi.stubGlobal("fetch", fetchMock);

    const ids = await fetchUploadIds("key", "ref", "UUx", 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ids).toEqual(["x", "x", "x"]);
  });

  it("throws with the status when YouTube rejects the call", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => new Response("nope", { status: 403 })));

    await expect(fetchUploadIds("key", "ref", "UUx")).rejects.toThrow(/403/);
  });
});
