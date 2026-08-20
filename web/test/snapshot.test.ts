import { describe, it, expect, vi, afterEach } from "vitest";
import {
  archiveIndexUrl, archiveMonthUrl, fetchArchiveIndex, fetchArchiveMonth, fetchSnapshot,
} from "@/lib/snapshot";

afterEach(() => vi.restoreAllMocks());

describe("fetchSnapshot", () => {
  it("returns parsed snapshot and fills missing arrays", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: "1.0.0", generated_at: "x", channels: { A: {} } }), { status: 200 })));
    const snap = await fetchSnapshot("/x.json");
    expect(snap.version).toBe("1.0.0");
    expect(snap.live).toEqual([]);
    expect(snap.upcoming).toEqual([]);
    expect(snap.recent).toEqual([]);
    expect(snap.milestones).toEqual([]);
    expect(snap.groups).toEqual([]);
    expect(snap.channels.A).toBeDefined();
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(fetchSnapshot("/x.json")).rejects.toThrow(/500/);
  });

  it("derives archive URLs from the configured snapshot URL", () => {
    const index = archiveIndexUrl("https://data.oshi.tw/streams/v1/snapshot.json?cache=1");
    expect(index).toBe("https://data.oshi.tw/streams/v1/archive/index.json");
    expect(archiveMonthUrl(index, "2024-03")).toBe("https://data.oshi.tw/streams/v1/archive/2024-03.json");
    expect(() => archiveMonthUrl(index, "2024-13")).toThrow(/invalid archive month/);
  });

  it("normalizes archive index and month payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "1.0.0",
        generated_at: "2026-07-21T00:00:00Z",
        months: [{ month: "2024-03", streams: 2, milestones: 1 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "1.0.0",
        month: "2024-03",
        channels: { A: { name: "A" } },
        streams: [{ videoId: "old" }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchArchiveIndex("/archive/index.json")).months).toEqual([
      { month: "2024-03", streams: 2, milestones: 1 },
    ]);
    const month = await fetchArchiveMonth("/archive/2024-03.json");
    expect(month.month).toBe("2024-03");
    expect(month.streams).toHaveLength(1);
    expect(month.milestones).toEqual([]);
  });
});
