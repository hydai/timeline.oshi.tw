import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCachedJson } from "@/lib/data-cache";

const policy = { freshFor: 60_000, maxAge: 900_000 };
const decode = (raw: unknown): { value: string } => {
  if (!raw || typeof raw !== "object" || !("value" in raw) || typeof raw.value !== "string") {
    throw new Error("invalid data");
  }
  return { value: raw.value };
};
const response = (value: string) => new Response(JSON.stringify({ value }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T08:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("persistent data cache", () => {
  it("survives a new module instance and shares data across page URLs", async () => {
    const fetchMock = vi.fn(async () => response("saved"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCachedJson("/data.json", decode, policy);
    vi.resetModules();
    const { fetchCachedJson: afterReload } = await import("@/lib/data-cache");
    window.history.replaceState(null, "", "/v/mizuki?month=2026-08");
    const onCached = vi.fn();
    const result = afterReload("/data.json", decode, policy, { onCached });
    expect(onCached).toHaveBeenCalledWith({ value: "saved" });
    expect(await result).toEqual({ value: "saved" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/data.json", { cache: "no-cache" });
  });

  it("shows stale data immediately and persists the background update", async () => {
    const fetchMock = vi.fn(async () => response("old"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCachedJson("/data.json", decode, policy);
    vi.setSystemTime(Date.now() + 61_000);
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const onCached = vi.fn();
    const pending = fetchCachedJson("/data.json", decode, policy, { onCached });
    expect(onCached).toHaveBeenCalledWith({ value: "old" });
    finish(response("new"));
    expect(await pending).toEqual({ value: "new" });
    expect(await fetchCachedJson("/data.json", decode, policy)).toEqual({ value: "new" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good data after a failed revalidation and allows a forced retry", async () => {
    const fetchMock = vi.fn(async () => response("old"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCachedJson("/data.json", decode, policy);
    fetchMock.mockResolvedValueOnce(new Response("failed", { status: 503 }));
    const onCached = vi.fn();
    await expect(fetchCachedJson("/data.json", decode, policy, { force: true, onCached })).rejects.toThrow("503");
    expect(onCached).toHaveBeenCalledWith({ value: "old" });
    expect(await fetchCachedJson("/data.json", decode, policy)).toEqual({ value: "old" });
    fetchMock.mockResolvedValueOnce(response("retried"));
    expect(await fetchCachedJson("/data.json", decode, policy, { force: true })).toEqual({ value: "retried" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not display data beyond its retention limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("old")));
    await fetchCachedJson("/data.json", decode, policy);
    vi.setSystemTime(Date.now() + policy.maxAge);
    vi.stubGlobal("fetch", vi.fn(async () => response("new")));
    const onCached = vi.fn();
    expect(await fetchCachedJson("/data.json", decode, policy, { onCached })).toEqual({ value: "new" });
    expect(onCached).not.toHaveBeenCalled();
  });

  it("deduplicates overlapping requests without mixing data sources", async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = fetchCachedJson("/data.json", decode, policy);
    const second = fetchCachedJson("/data.json", decode, policy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(response("shared"));
    expect(await Promise.all([first, second])).toEqual([{ value: "shared" }, { value: "shared" }]);
    fetchMock.mockResolvedValueOnce(response("other origin"));
    expect(await fetchCachedJson("https://other.example/data.json", decode, policy)).toEqual({ value: "other origin" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers from malformed cached data and disabled storage", async () => {
    const fetchMock = vi.fn(async () => response("valid"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCachedJson("/data.json", decode, policy);
    localStorage.setItem(localStorage.key(0)!, "{damaged");
    expect(await fetchCachedJson("/data.json", decode, policy)).toEqual({ value: "valid" });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    expect(await fetchCachedJson("/data.json", decode, policy)).toEqual({ value: "valid" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bounds accumulated months without evicting the snapshot, index, or theme", async () => {
    localStorage.setItem("theme", "dark");
    const fetchMock = vi.fn(async () => response("data"));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCachedJson("/snapshot.json", decode, { ...policy, priority: 1 });
    await fetchCachedJson("/archive/index.json", decode, { ...policy, priority: 1 });
    for (let month = 1; month <= 12; month++) {
      vi.setSystemTime(Date.now() + 1);
      await fetchCachedJson(`/archive/${month}.json`, decode, policy);
    }
    expect(localStorage.length).toBe(9); // Eight data entries plus the user's theme.
    expect(localStorage.getItem("theme")).toBe("dark");
    fetchMock.mockClear();
    const onCached = vi.fn();
    await fetchCachedJson("/snapshot.json", decode, policy, { onCached });
    await fetchCachedJson("/archive/index.json", decode, policy, { onCached });
    await fetchCachedJson("/archive/12.json", decode, policy, { onCached });
    expect(onCached).toHaveBeenCalledTimes(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
