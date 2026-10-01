import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { boundedText, twitchApi } from "../src/twitch-api";

const twitchEnv = { ...env, TWITCH_CLIENT_ID: "test-client", TWITCH_CLIENT_SECRET: "test-secret" };
beforeEach(async () => { await env.DB.prepare("DELETE FROM twitch_state").run(); });
afterEach(() => vi.unstubAllGlobals());

describe("Helix client", () => {
  it("requests all 100 streams per batch and reuses the private app token", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("oauth2/token")
      ? Response.json({ access_token: "private-token", expires_in: 3600 }) : Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    await twitchApi(twitchEnv).streams(Array.from({ length: 101 }, (_, i) => String(i + 1)));
    await twitchApi(twitchEnv).users(["example"]);
    const calls = fetcher.mock.calls.map(([url]) => new URL(url));
    expect(calls.filter(url => url.pathname === "/oauth2/token")).toHaveLength(1);
    const batches = calls.filter(url => url.pathname === "/helix/streams");
    expect(batches.map(url => url.searchParams.getAll("user_id").length)).toEqual([100, 1]);
    expect(batches.every(url => url.searchParams.get("first") === "100")).toBe(true);
  });
  it("renews once on 401, but surfaces repeated auth failure without leaking a secret", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("oauth2/token")
      ? Response.json({ access_token: "private-token", expires_in: 3600 }) : new Response("secret upstream body", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(twitchApi(twitchEnv).users(["example"])).rejects.toThrow("Twitch GET users failed (401)");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("does not send credentials to an invalid callback", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(twitchApi({ ...twitchEnv, TWITCH_WEBHOOK_URL: "http://example.test/callback" }).subscribe("stream.online", "1", "42")).rejects.toThrow("HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enforces actual byte limits without trusting Content-Length", async () => {
    await expect(boundedText(new Response("123456", { headers: { "Content-Length": "1" } }), 5)).rejects.toThrow("too large");
    expect(await boundedText(new Response("開台"), 6)).toBe("開台");
  });
});
