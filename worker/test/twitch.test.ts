import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { getActiveVideoIds, listEndedStreamsByMonth, listStreamsByStatus, upsertChannelId, upsertStream } from "../src/db";
import { twitchCandidates, twitchLogin } from "../src/twitch-accounts";
import { handleTwitchWebhook, refreshTwitch } from "../src/twitch";
import { endTwitchStream, observeTwitchStream, pruneTwitchData, setTwitchHistoryPermission, startTwitchStream, syncTwitchAccounts, twitchAccounts, updateTwitchMetadata } from "../src/twitch-db";
import { toSnapshotStream } from "../src/snapshot";
import { publishArchive } from "../src/archive";
import { archiveMonthKey, readArchiveIndex } from "../src/r2";
import type { TwitchApi, TwitchStream } from "../src/twitch-api";
import type { Env, RosterEntry } from "../src/types";
import consents from "../seed/twitch-consents.json";
import worker from "../src/index";

const NOW = "2026-10-01T10:00:00.000Z";
const START = "2026-10-01T09:00:00.000Z";
const twitchEnv: Env = { ...env, TWITCH_WEBHOOK_SECRET: "a-test-only-webhook-signing-secret" };
const stream: TwitchStream = {
  id: "123", user_id: "42", user_login: "example", title: "開台雜談", game_id: "1", game_name: "Just Chatting",
  started_at: START, viewer_count: 12, thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_example-{width}x{height}.jpg",
};
function api(overrides: Partial<TwitchApi> = {}): TwitchApi {
  return { users: vi.fn(async () => []), usersById: vi.fn(async () => []), streams: vi.fn(async () => []),
    channels: vi.fn(async () => []), subscriptions: vi.fn(async () => []), subscribe: vi.fn(async () => {}), unsubscribe: vi.fn(async () => {}), ...overrides };
}
async function account(granted = true) {
  await upsertChannelId(env.DB, "UCtest", START);
  await env.DB.prepare(`INSERT INTO twitch_accounts(channel_id,login,user_id,source,status,history_granted_at)
    VALUES('UCtest','example','42','both','verified',?1)`).bind(granted ? START : null).run();
}
async function signed(type: string, event: unknown, options: { id?: string; time?: string; messageType?: string; challenge?: string; condition?: string } = {}): Promise<Request> {
  const id = options.id ?? crypto.randomUUID(), time = options.time ?? NOW;
  const raw = JSON.stringify({ subscription: { type, version: type === "channel.update" ? "2" : "1", condition: { broadcaster_user_id: options.condition ?? "42" } }, event, challenge: options.challenge });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(twitchEnv.TWITCH_WEBHOOK_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id + time + raw)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://worker.example/twitch/eventsub", { method: "POST", body: raw, headers: {
    "Twitch-Eventsub-Message-Id": id, "Twitch-Eventsub-Message-Timestamp": time,
    "Twitch-Eventsub-Message-Signature": `sha256=${signature}`, "Twitch-Eventsub-Message-Type": options.messageType ?? "notification",
  } });
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM twitch_inbox; DELETE FROM twitch_state; DELETE FROM streams; DELETE FROM milestones; DELETE FROM channels;");
  await env.DATA_PUBLIC.delete(["streams/v1/archive/index.json", archiveMonthKey("2026-10")]);
});

describe("Twitch account discovery", () => {
  it("normalizes logins without accepting another host or a video URL", () => {
    expect(twitchLogin("https://www.twitch.tv/Example/?ref=timeline")).toBe("example");
    expect(twitchLogin("Example")).toBe("example");
    for (const bad of ["https://twitch.tv.evil.test/example", "https://user@twitch.tv/example", "https://twitch.tv/videos/123", "../example", 42]) expect(twitchLogin(bad)).toBeNull();
  });
  it("merges the sources and blocks contradictory or duplicate mappings", () => {
    const entry = (twitchLogin: string): RosterEntry => ({ twitchLogin, youtubeId: "a", twvtuberId: "t", name: "n", group: null, nationality: null, avatar: null, youtubeSubs: null });
    const rows = twitchCandidates(new Set(["a", "b", "c", "d"]), [
      { youtubeChannelId: "a", handle: null, group: "solo", twitchLogin: "one" },
      { youtubeChannelId: "c", handle: null, group: "solo", twitchLogin: "same" },
    ], new Map([["a", entry("different")], ["b", entry("two")], ["d", entry("same")]]));
    expect(rows.map(r => [r.channelId, r.source, r.conflict])).toEqual([["a", "both", true], ["b", "twvtuber", false], ["c", "prism", true], ["d", "twvtuber", true]]);
  });
  it("verifies a new account without automatically granting unlisted consent", async () => {
    await upsertChannelId(env.DB, "UCtest", START);
    await syncTwitchAccounts(env.DB, api({ users: async () => [{ id: "42", login: "example" }] }), [{ channelId: "UCtest", login: "example", source: "prism", conflict: false }], NOW);
    expect((await twitchAccounts(env.DB))[0]).toMatchObject({ user_id: "42", status: "verified", history_granted_at: null });
  });
  it("keeps numeric identity after a rename and does not transfer it to a new login owner", async () => {
    await account();
    const client = api({ usersById: async () => [{ id: "42", login: "renamed" }] });
    await syncTwitchAccounts(env.DB, client, [{ channelId: "UCtest", login: "example", source: "prism", conflict: false }], NOW);
    expect((await twitchAccounts(env.DB))[0]).toMatchObject({ user_id: "42", login: "renamed", status: "verified" });
    expect(client.users).toHaveBeenCalledWith([]);
    await syncTwitchAccounts(env.DB, client, [{ channelId: "UCtest", login: "example", source: "prism", conflict: false }], NOW);
    expect((await twitchAccounts(env.DB))[0]?.status).toBe("verified");
    await syncTwitchAccounts(env.DB, client, [{ channelId: "UCtest", login: "someone_else", source: "prism", conflict: false }], NOW);
    expect((await twitchAccounts(env.DB))[0]?.status).toBe("conflict");
  });
  it("applies the explicit approved list but never regrants a withdrawn account", async () => {
    const approved = consents.accounts[0]!;
    await upsertChannelId(env.DB, approved.channelId, START);
    const candidates = [{ ...approved, source: "prism" as const, conflict: false }];
    const client = api({ users: async () => [{ id: "42", login: approved.login }] });
    await syncTwitchAccounts(env.DB, client, candidates, NOW);
    expect((await twitchAccounts(env.DB))[0]?.history_granted_at).toBe(consents.confirmedAt);
    await setTwitchHistoryPermission(env.DB, "42", false, "withdrawn", NOW);
    await syncTwitchAccounts(env.DB, client, candidates, NOW);
    expect((await twitchAccounts(env.DB))[0]).toMatchObject({ status: "disabled", history_granted_at: null });
  });
  it.each(["verified", "missing", "conflict"])("preserves withdrawal while a %s discovery result is in flight", async (outcome) => {
    await account();
    const client = api({ usersById: async () => {
      await setTwitchHistoryPermission(env.DB, "42", false, "withdrawn during Helix lookup", NOW);
      return outcome === "missing" ? [] : [{ id: "42", login: "example" }];
    } });
    await syncTwitchAccounts(env.DB, client, [{ channelId: "UCtest", login: outcome === "conflict" ? "different" : "example", source: "prism", conflict: false }], NOW);
    expect((await twitchAccounts(env.DB))[0]).toMatchObject({ status: "disabled", history_granted_at: null, history_revoked_at: NOW });
    await observeTwitchStream(env.DB, stream, NOW);
    await refreshTwitch({ ...twitchEnv, TWITCH_WEBHOOK_URL: "https://worker.example/twitch/eventsub" }, { now: NOW, api: client });
    expect(await env.DB.prepare("SELECT 1 FROM twitch_streams").first()).toBeNull();
    expect(client.subscribe).not.toHaveBeenCalled();
  });
});

describe("Twitch stream lifecycle", () => {
  it("rechecks consent atomically if withdrawal happens just before stream insertion", async () => {
    await account();
    const batch = env.DB.batch.bind(env.DB);
    const intercepted = vi.spyOn(env.DB, "batch").mockImplementationOnce(async <T,>(statements: D1PreparedStatement[]) => {
      await setTwitchHistoryPermission(env.DB, "42", false, "withdrawn before insertion", NOW);
      return batch<T>(statements);
    });
    try { await startTwitchStream(env.DB, "42", "123", START, NOW); }
    finally { intercepted.mockRestore(); }
    expect(await env.DB.prepare("SELECT 1 FROM twitch_streams").first()).toBeNull();
    expect((await twitchAccounts(env.DB))[0]?.status).toBe("disabled");
  });
  it("preserves the first observed title/category, records changes, and archives without a VOD", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, START);
    await updateTwitchMetadata(env.DB, "123", { title: "來玩遊戲", categoryId: "2", categoryName: "Minecraft" }, NOW);
    await endTwitchStream(env.DB, "42", "2026-10-01T11:00:00.000Z");
    const [record] = await listEndedStreamsByMonth(env.DB, "2026-10", "2026-10-02T00:00:00.000Z");
    expect(toSnapshotStream(record!)).toMatchObject({ videoId: "twitch:123", platform: "twitch", title: "開台雜談", categoryName: "Just Chatting", url: null, thumbnail: null, estimatedEnd: "2026-10-01T11:00:00.000Z" });
    expect(record!.actualEnd).toBeNull();
    expect((await env.DB.prepare("SELECT title FROM twitch_stream_changes ORDER BY observed_at").all()).results).toEqual([{ title: "開台雜談" }, { title: "來玩遊戲" }]);
  });
  it("never sends Twitch stream IDs to YouTube or collides with an existing video", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, NOW);
    await upsertStream(env.DB, { videoId: "123", channelId: "UCtest", status: "live", title: "YouTube", thumbnailUrl: null, scheduledStart: null, actualStart: START, actualEnd: null, concurrentViewers: null }, NOW);
    expect(await getActiveVideoIds(env.DB, START)).toEqual(["123"]);
    expect((await listStreamsByStatus(env.DB, "live", NOW)).map(s => s.videoId).sort()).toEqual(["123", "twitch:123"]);
  });
  it("ignores stale category and offline messages after a restart", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, START);
    await observeTwitchStream(env.DB, { ...stream, id: "456", started_at: NOW, title: "重開" }, NOW);
    await endTwitchStream(env.DB, "42", "2026-10-01T09:50:00.000Z");
    await updateTwitchMetadata(env.DB, "456", { title: "stale", categoryId: "0", categoryName: "stale" }, START);
    expect((await listStreamsByStatus(env.DB, "live", NOW)).map(s => s.title)).toEqual(["重開"]);
  });
  it("remembers an offline message that arrived before its online message", async () => {
    await account();
    await endTwitchStream(env.DB, "42", NOW);
    await startTwitchStream(env.DB, "42", "123", START, NOW);
    expect(await listStreamsByStatus(env.DB, "live", NOW)).toEqual([]);
    expect((await listEndedStreamsByMonth(env.DB, "2026-10", NOW))[0]?.estimatedEnd).toBe(NOW);
  });
  it("does not archive unapproved accounts and expires their temporary data", async () => {
    await account(false);
    await observeTwitchStream(env.DB, stream, NOW);
    expect((await listStreamsByStatus(env.DB, "live", NOW))).toHaveLength(1);
    await endTwitchStream(env.DB, "42", "2026-10-01T11:00:00.000Z");
    expect(await listEndedStreamsByMonth(env.DB, "2026-10", "2026-10-02T00:00:00.000Z")).toEqual([]);
    expect((await env.DB.prepare("SELECT * FROM twitch_stream_changes").all()).results).toEqual([]);
    await pruneTwitchData(env.DB, "2026-10-02T10:00:00.000Z");
    expect(await env.DB.prepare("SELECT 1 FROM twitch_streams").first()).toBeNull();
  });
  it("archives by estimated end in Taipei and republishes a late initial title", async () => {
    await account();
    const first = "2026-09-30T15:00:00.000Z";
    await observeTwitchStream(env.DB, { ...stream, started_at: first }, "2026-09-30T15:30:00.000Z");
    await endTwitchStream(env.DB, "42", "2026-09-30T16:01:00.000Z");
    expect(await listEndedStreamsByMonth(env.DB, "2026-09", NOW)).toEqual([]);
    expect(await listEndedStreamsByMonth(env.DB, "2026-10", NOW)).toHaveLength(1);
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), NOW);
    await updateTwitchMetadata(env.DB, "123", { title: "遲到的開台標題", categoryId: "1", categoryName: "Music" }, first);
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), "2026-11-01T00:00:00.000Z", "current-month");
    const archived = await (await env.DATA_PUBLIC.get(archiveMonthKey("2026-10")))!.json<{ streams: Array<{ title: string }> }>();
    expect(archived.streams[0]?.title).toBe("遲到的開台標題");
  });
  it("revocation erases history, stops tracking and overwrites an otherwise empty public month", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, START);
    await endTwitchStream(env.DB, "42", NOW);
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), NOW);
    expect((await readArchiveIndex(env.DATA_PUBLIC))?.months[0]?.streams).toBe(1);
    await setTwitchHistoryPermission(env.DB, "42", false, "Broadcaster withdrawal", NOW);
    await publishArchive(env.DB, env.DATA_PUBLIC, new Map(), NOW, "current-month");
    expect((await (await env.DATA_PUBLIC.get(archiveMonthKey("2026-10")))!.json<{ streams: unknown[] }>()).streams).toEqual([]);
    expect((await readArchiveIndex(env.DATA_PUBLIC))?.months).toEqual([]);
    expect((await twitchAccounts(env.DB))[0]?.status).toBe("disabled");
  });
});

describe("EventSub and reconciliation", () => {
  it("verifies challenge signatures and refuses tampered, stale and mismatched events", async () => {
    await account();
    const challenge = await handleTwitchWebhook(await signed("stream.online", undefined, { messageType: "webhook_callback_verification", challenge: "challenge-text" }), twitchEnv, NOW);
    expect(await challenge.text()).toBe("challenge-text");
    const bad = await signed("stream.offline", { broadcaster_user_id: "42" });
    bad.headers.set("Twitch-Eventsub-Message-Signature", `sha256=${"0".repeat(64)}`);
    expect((await handleTwitchWebhook(bad, twitchEnv, NOW)).status).toBe(403);
    expect((await handleTwitchWebhook(await signed("stream.offline", { broadcaster_user_id: "42" }, { time: START }), twitchEnv, NOW)).status).toBe(403);
    expect((await handleTwitchWebhook(await signed("stream.offline", { broadcaster_user_id: "999" }), twitchEnv, NOW)).status).toBe(400);
  });
  it("deduplicates delivery and retries enrichment after upstream failure", async () => {
    await account();
    const event = { broadcaster_user_id: "42", id: "123", type: "live", started_at: START };
    for (let i = 0; i < 2; i++) expect((await handleTwitchWebhook(await signed("stream.online", event, { id: "same-id" }), twitchEnv, NOW)).status).toBe(204);
    expect((await env.DB.prepare("SELECT * FROM twitch_inbox").all()).results).toHaveLength(1);
    await expect(refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api({ streams: async () => { throw new Error("offline API"); } }) })).rejects.toThrow("offline API");
    expect(await env.DB.prepare("SELECT processed_at FROM twitch_inbox").first()).toEqual({ processed_at: null });
    await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api({ streams: async () => [stream] }) });
    expect((await listStreamsByStatus(env.DB, "live", NOW))[0]?.title).toBe("開台雜談");
    expect((await env.DB.prepare("SELECT * FROM twitch_streams").all()).results).toHaveLength(1);
  });
  it("does not mark streams offline on API failure; a successful empty response ends them", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, START);
    await expect(refreshTwitch(twitchEnv, { now: NOW, api: api({ streams: async () => { throw new Error("upstream failure"); } }) })).rejects.toThrow();
    expect(await listStreamsByStatus(env.DB, "live", NOW)).toHaveLength(1);
    await refreshTwitch(twitchEnv, { now: NOW, api: api() });
    expect(await listStreamsByStatus(env.DB, "live", NOW)).toEqual([]);
  });
  it("processes recorded title changes before fetching the latest title", async () => {
    await account();
    await handleTwitchWebhook(await signed("stream.online", { broadcaster_user_id: "42", id: "123", type: "live", started_at: START }, { time: "2026-10-01T09:55:00.000Z" }), twitchEnv, NOW);
    await handleTwitchWebhook(await signed("channel.update", { broadcaster_user_id: "42", title: "最早的標題", category_id: "1", category_name: "Music" }, { time: "2026-10-01T09:56:00.000Z" }), twitchEnv, NOW);
    await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api({ streams: async () => [stream] }) });
    expect((await listStreamsByStatus(env.DB, "live", NOW))[0]).toMatchObject({ initialTitle: "最早的標題", title: "開台雜談" });
  });
  it("recovers metadata delivered before online, including already processed updates", async () => {
    await account();
    await handleTwitchWebhook(await signed("channel.update", { broadcaster_user_id: "42", title: "先到的標題", category_id: "1", category_name: "Music" }, { time: "2026-10-01T09:56:00.000Z" }), twitchEnv, NOW);
    await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api() });
    await handleTwitchWebhook(await signed("stream.online", { broadcaster_user_id: "42", id: "123", type: "live", started_at: START }), twitchEnv, NOW);
    await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api({ streams: async () => [stream] }) });
    expect((await listStreamsByStatus(env.DB, "live", NOW))[0]).toMatchObject({ initialTitle: "先到的標題", title: "開台雜談" });
  });
  it("inserts late historical metadata without replacing the current title", async () => {
    await account();
    await observeTwitchStream(env.DB, stream, NOW);
    await updateTwitchMetadata(env.DB, "123", { title: "earlier", categoryId: "2", categoryName: "Music" }, START);
    expect((await listStreamsByStatus(env.DB, "live", NOW))[0]).toMatchObject({ initialTitle: "earlier", title: "開台雜談" });
  });
  it.each(["offline", "next-online", "beyond-batch", "existing-row"])("bounds metadata replay at the %s session boundary", async (boundary) => {
    await account();
    if (boundary === "existing-row") await startTwitchStream(env.DB, "42", "123", START, START);
    const queue = async (type: string, event: unknown, time: string) => {
      expect((await handleTwitchWebhook(await signed(type, event, { time }), twitchEnv, NOW)).status).toBe(204);
    };
    const oldOnline = { broadcaster_user_id: "42", id: "123", type: "live", started_at: START };
    await queue("stream.online", oldOnline, "2026-10-01T09:51:00.000Z");
    if (boundary === "beyond-batch") {
      // The next lifecycle boundary must be honored even outside this drain's 30 rows.
      for (let i = 1; i < 30; i++) await queue("stream.online", oldOnline, `2026-10-01T09:51:${String(i).padStart(2, "0")}.000Z`);
    }
    if (boundary === "offline") {
      await queue("stream.offline", { broadcaster_user_id: "42", id: "123" }, "2026-10-01T09:54:00.000Z");
      await queue("channel.update", { broadcaster_user_id: "42", title: "離線編輯", category_id: "0", category_name: "" }, "2026-10-01T09:54:30.000Z");
    }
    // Delivery time is later than the first title update; session time is not.
    await queue("stream.online", { broadcaster_user_id: "42", id: "456", type: "live", started_at: "2026-10-01T17:55:00+08:00" }, "2026-10-01T09:57:00.000Z");
    await queue("channel.update", { broadcaster_user_id: "42", title: "下一場標題", category_id: "2", category_name: "Minecraft" }, "2026-10-01T09:56:00.000Z");
    await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api() });
    expect(await env.DB.prepare("SELECT initial_title FROM twitch_streams WHERE stream_id='123'").first()).toEqual({ initial_title: null });
    if (boundary === "beyond-batch") await refreshTwitch(twitchEnv, { now: NOW, eventsOnly: true, api: api() });
    expect(await env.DB.prepare("SELECT initial_title,initial_category_name FROM twitch_streams WHERE stream_id='456'").first())
      .toEqual({ initial_title: "下一場標題", initial_category_name: "Minecraft" });
    expect((await env.DB.prepare("SELECT * FROM twitch_stream_changes WHERE stream_id='123'").all()).results).toEqual([]);
  });
  it("reconciles only its own callback and avoids recreating healthy subscriptions", async () => {
    await account();
    const callback = "https://worker.example/twitch/eventsub";
    const subscription = { id: "healthy", type: "stream.online", version: "1", status: "enabled", condition: { broadcaster_user_id: "42" }, transport: { method: "webhook", callback } };
    const client = api({ subscriptions: vi.fn(async () => [subscription, { ...subscription, id: "foreign", transport: { method: "webhook", callback: "https://other.example/" } }, { ...subscription, id: "disabled", condition: { broadcaster_user_id: "999" } }]) });
    await refreshTwitch({ ...twitchEnv, TWITCH_WEBHOOK_URL: callback }, { now: NOW, api: client });
    expect(client.unsubscribe).toHaveBeenCalledExactlyOnceWith("disabled");
    expect(client.subscribe).toHaveBeenCalledTimes(2);
    expect(client.subscribe).toHaveBeenCalledWith("channel.update", "2", "42");
    await refreshTwitch({ ...twitchEnv, TWITCH_WEBHOOK_URL: callback }, { now: NOW, api: client });
    expect(client.subscriptions).toHaveBeenCalledTimes(1);
  });
  it.each(["enabled", "webhook_callback_verification_pending"])("removes a stale %s subscription version without touching other callbacks or types", async (status) => {
    await account();
    const callback = "https://worker.example/twitch/eventsub";
    const stale = { id: "old-version", type: "channel.update", version: "1", status, condition: { broadcaster_user_id: "42" }, transport: { method: "webhook", callback } };
    const client = api({ subscriptions: async () => [stale,
      { ...stale, id: "foreign-callback", transport: { method: "webhook", callback: "https://other.example/" } },
      { ...stale, id: "other-type", type: "channel.follow" },
    ] });
    await refreshTwitch({ ...twitchEnv, TWITCH_WEBHOOK_URL: callback }, { now: NOW, api: client });
    expect(client.unsubscribe).toHaveBeenCalledExactlyOnceWith("old-version");
    expect(client.subscribe).toHaveBeenCalledWith("channel.update", "2", "42");
    expect(vi.mocked(client.unsubscribe).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(client.subscribe).mock.invocationCallOrder[0]!);
  });
  it("protects account and permission endpoints and restricts webhook methods", async () => {
    const adminEnv = { ...twitchEnv, MANUAL_TRIGGER_TOKEN: "test-token" };
    for (const route of ["accounts", "history", "refresh"]) {
      expect((await worker.fetch(new Request(`https://worker.example/twitch/${route}`), adminEnv)).status).toBe(403);
    }
    expect((await worker.fetch(new Request("https://worker.example/twitch/eventsub"), adminEnv)).status).toBe(405);
    const response = await worker.fetch(new Request("https://worker.example/twitch/history", { method: "POST", headers: { "X-Trigger-Token": "test-token" }, body: "{}" }), adminEnv);
    expect(response.status).toBe(400);
  });
});
