import { z } from "zod";
import { boundedText, twitchApi, twitchConfigured, type TwitchApi } from "./twitch-api";
import {
  acquireTwitchLease, endTwitchStream, observeTwitchStream, pruneTwitchData,
  releaseTwitchLease, startTwitchStream, syncTwitchAccounts, twitchAccounts,
  updateTwitchChannel, updateTwitchMetadata,
} from "./twitch-db";
import { twitchCandidates } from "./twitch-accounts";
import type { PrismStreamer } from "./prism";
import type { Env, RosterEntry } from "./types";

const TYPES = [["stream.online", "1"], ["stream.offline", "1"], ["channel.update", "2"]] as const;
const userId = z.string().regex(/^\d+$/);
const online = z.object({ broadcaster_user_id: userId, id: userId, type: z.literal("live"), started_at: z.iso.datetime({ offset: true }) });
const offline = z.object({ broadcaster_user_id: userId, id: userId.optional() });
const channelUpdate = z.object({ broadcaster_user_id: userId, title: z.string(), category_id: z.string(), category_name: z.string() });
const envelope = z.object({
  subscription: z.object({ type: z.string(), version: z.string(), condition: z.object({ broadcaster_user_id: userId }) }),
  event: z.unknown().optional(), challenge: z.string().optional(),
});

export async function handleTwitchWebhook(request: Request, env: Env, now = new Date().toISOString()): Promise<Response> {
  if (!env.TWITCH_WEBHOOK_SECRET) return new Response("Twitch is not configured", { status: 503 });
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id") ?? "";
  const sentAt = request.headers.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = request.headers.get("Twitch-Eventsub-Message-Signature") ?? "";
  const type = request.headers.get("Twitch-Eventsub-Message-Type");
  const age = Date.parse(now) - Date.parse(sentAt);
  if (!messageId || messageId.length > 256 || !Number.isFinite(age) || age > 600_000 || age < -60_000 || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return new Response("invalid event headers", { status: 403 });
  }
  let raw: string;
  try { raw = await boundedText(request, 65_536); }
  catch { return new Response("invalid event body", { status: 413 }); }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.TWITCH_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signatureBytes = Uint8Array.from(signature.slice(7).match(/../g)!, h => parseInt(h, 16));
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(messageId + sentAt + raw))) {
    return new Response("invalid event signature", { status: 403 });
  }
  let body: z.infer<typeof envelope>;
  try { body = envelope.parse(JSON.parse(raw)); }
  catch { return new Response("invalid event payload", { status: 400 }); }
  const subscription = body.subscription;
  if (!TYPES.some(([t, v]) => t === subscription.type && v === subscription.version)) return new Response("unsupported event", { status: 400 });
  const account = await env.DB.prepare(`SELECT a.user_id FROM twitch_accounts a JOIN channels c ON c.channel_id=a.channel_id
    WHERE a.user_id=?1 AND a.status='verified' AND c.enabled=1`).bind(subscription.condition.broadcaster_user_id).first();
  if (!account) return new Response(null, { status: 204 });
  if (type === "webhook_callback_verification") {
    return body.challenge ? new Response(body.challenge, { headers: { "Content-Type": "text/plain" } }) : new Response("missing challenge", { status: 400 });
  }
  if (type === "revocation") {
    // Make the next reconciliation inspect and recreate the failed subscription.
    await env.DB.prepare("DELETE FROM twitch_state WHERE key='subscriptions-checked'").run();
    return new Response(null, { status: 204 });
  }
  if (type !== "notification") return new Response("unsupported message", { status: 400 });
  let event: { broadcaster_user_id: string };
  try {
    event = (subscription.type === "stream.online" ? online : subscription.type === "stream.offline" ? offline : channelUpdate).parse(body.event);
  } catch { return new Response("invalid event", { status: 400 }); }
  if (event.broadcaster_user_id !== subscription.condition.broadcaster_user_id) return new Response("event identity mismatch", { status: 400 });
  await env.DB.prepare(`INSERT INTO twitch_inbox(message_id,type,user_id,payload,sent_at,received_at)
    VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(message_id) DO NOTHING`)
    .bind(messageId, subscription.type, event.broadcaster_user_id, JSON.stringify(event), new Date(sentAt).toISOString(), now).run();
  return new Response(null, { status: 204 });
}

async function drainInbox(env: Env, api: TwitchApi, clock: () => string): Promise<void> {
  const started = new Map<string, string>();
  const { results } = await env.DB.prepare(`SELECT * FROM twitch_inbox WHERE processed_at IS NULL
    ORDER BY sent_at, CASE type WHEN 'stream.online' THEN 0 WHEN 'channel.update' THEN 1 ELSE 2 END LIMIT 30`)
    .all<{ message_id: string; type: string; user_id: string; payload: string; sent_at: string }>();
  for (const row of results) {
    const account = await env.DB.prepare("SELECT 1 FROM twitch_accounts WHERE user_id=?1 AND status='verified'").bind(row.user_id).first();
    if (!account) {
      await env.DB.prepare("DELETE FROM twitch_inbox WHERE message_id=?1").bind(row.message_id).run();
      continue;
    }
    const payload: unknown = JSON.parse(row.payload);
    if (row.type === "stream.online") {
      const event = online.parse(payload);
      await startTwitchStream(env.DB, event.broadcaster_user_id, event.id, new Date(event.started_at).toISOString(), row.sent_at);
      // A title notification can be delivered and processed before the online
      // notification. Replay the retained, signed metadata for this session.
      const updates = await env.DB.prepare(`SELECT i.payload,i.sent_at FROM twitch_inbox i
        JOIN twitch_streams s ON s.stream_id=?2 AND s.user_id=i.user_id
        WHERE i.user_id=?1 AND i.type='channel.update' AND i.sent_at>=s.started_at
          AND (s.ended_at IS NULL OR i.sent_at<s.ended_at) ORDER BY i.sent_at`)
        .bind(row.user_id, event.id)
        .all<{ payload: string; sent_at: string }>();
      for (const update of updates.results) {
        const value = channelUpdate.parse(JSON.parse(update.payload));
        await updateTwitchMetadata(env.DB, event.id, {
          title: value.title, categoryId: value.category_id, categoryName: value.category_name }, update.sent_at);
      }
      started.set(row.user_id, event.id);
    } else if (row.type === "stream.offline") {
      const event = offline.parse(payload);
      await endTwitchStream(env.DB, row.user_id, row.sent_at, event.id);
    } else {
      const event = channelUpdate.parse(payload);
      await updateTwitchChannel(env.DB, row.user_id, {
        broadcaster_id: row.user_id, title: event.title, game_id: event.category_id, game_name: event.category_name,
      }, row.sent_at);
    }
  }
  if (started.size) {
    // Apply recorded channel.update events before taking a newer API snapshot,
    // otherwise the newer metadata timestamp would suppress the entire backlog.
    const streams = await api.streams([...started.keys()]);
    const now = clock();
    for (const stream of streams) {
      if (started.get(stream.user_id) === stream.id) await observeTwitchStream(env.DB, stream, now);
    }
    const missing = [...started.keys()].filter(id => !streams.some(s => s.user_id === id));
    for (const info of await api.channels(missing)) {
      await updateTwitchChannel(env.DB, info.broadcaster_id, info, clock());
    }
  }
  if (results.length) await env.DB.batch(results.map(row => env.DB.prepare("UPDATE twitch_inbox SET processed_at=?2 WHERE message_id=?1").bind(row.message_id, clock())));
}

async function syncSubscriptions(env: Env, api: TwitchApi, now: string): Promise<void> {
  if (!env.TWITCH_WEBHOOK_URL || !env.TWITCH_WEBHOOK_SECRET) return;
  if (!/^[\x20-\x7e]{10,100}$/.test(env.TWITCH_WEBHOOK_SECRET)) throw new Error("Invalid Twitch webhook secret length or encoding");
  const checked = await env.DB.prepare("SELECT 1 FROM twitch_state WHERE key='subscriptions-checked' AND expires_at>?1").bind(now).first();
  if (checked) return;
  const accounts = (await twitchAccounts(env.DB)).filter(a => a.status === "verified" && a.user_id);
  const subscriptions = await api.subscriptions();
  const callback = new URL(env.TWITCH_WEBHOOK_URL).href;
  for (const s of subscriptions.filter(s => s.transport.callback === callback && TYPES.some(([type]) => type === s.type))) {
    if (!TYPES.some(([type, version]) => type === s.type && version === s.version) ||
      !accounts.some(a => a.user_id === s.condition.broadcaster_user_id) || !["enabled", "webhook_callback_verification_pending"].includes(s.status)) {
      await api.unsubscribe(s.id);
    }
  }
  const missing: Array<() => Promise<void>> = [];
  for (const a of accounts) {
    for (const [type, version] of TYPES) {
      if (subscriptions.some(s => s.type === type && s.version === version && s.condition.broadcaster_user_id === a.user_id &&
        s.transport.callback === callback && ["enabled", "webhook_callback_verification_pending"].includes(s.status))) continue;
      missing.push(() => api.subscribe(type, version, a.user_id!));
    }
  }
  // Bound concurrency to Workers' simultaneous outbound connection limit.
  for (let i = 0; i < missing.length; i += 6) {
    const results = await Promise.allSettled(missing.slice(i, i + 6).map(create => create()));
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO twitch_state(key,value,expires_at) VALUES('subscriptions-checked','1',?1)")
    .bind(new Date(Date.parse(now) + 3_600_000).toISOString()).run();
}

export interface TwitchRefreshOptions {
  now: string;
  discovery?: { tracked: Set<string>; prism: PrismStreamer[]; roster: Map<string, RosterEntry> };
  eventsOnly?: boolean;
  api?: TwitchApi;
}

export async function refreshTwitch(env: Env, options: TwitchRefreshOptions): Promise<void> {
  if (!twitchConfigured(env) && !options.api) {
    await pruneTwitchData(env.DB, options.now);
    return;
  }
  const clock = () => options.api ? options.now : new Date().toISOString();
  const owner = await acquireTwitchLease(env.DB, "ingestion-lock", clock(), 300);
  if (!owner) return; // durable inbox and next cron retain the work
  const api = options.api ?? twitchApi(env);
  try {
    await pruneTwitchData(env.DB, options.now);
    if (options.discovery) {
      const { tracked, prism, roster } = options.discovery;
      await syncTwitchAccounts(env.DB, api, twitchCandidates(tracked, prism, roster), options.now);
      await env.DB.prepare("DELETE FROM twitch_state WHERE key='subscriptions-checked'").run();
    }
    await drainInbox(env, api, clock);
    if (!options.eventsOnly) {
      const ids = (await twitchAccounts(env.DB)).filter(a => a.status === "verified").flatMap(a => a.user_id ? [a.user_id] : []);
      // All batches must succeed before any absent broadcaster is marked offline.
      const streams = await api.streams(ids);
      const observedAt = clock();
      for (const stream of streams) {
        if (ids.includes(stream.user_id)) await observeTwitchStream(env.DB, stream, observedAt);
      }
      const onlineIds = new Set(streams.map(s => s.user_id));
      for (const id of ids) if (!onlineIds.has(id)) await endTwitchStream(env.DB, id, observedAt);
      await syncSubscriptions(env, api, clock());
    }
  } finally { await releaseTwitchLease(env.DB, "ingestion-lock", owner); }
}

export async function tryRefreshTwitch(env: Env, options: TwitchRefreshOptions): Promise<void> {
  try { await refreshTwitch(env, options); }
  catch (error) { console.error(JSON.stringify({ message: "Twitch refresh failed", error: error instanceof Error ? error.message : "unknown error" })); }
}
