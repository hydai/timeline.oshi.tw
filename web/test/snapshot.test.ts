import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSnapshot } from "@/lib/snapshot";

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
});
