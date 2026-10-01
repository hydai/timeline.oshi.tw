import type { Env } from "./types";
import { backfillChannel, type BackfillDeps } from "./backfill";
import { heavyRefresh, lightRefresh, type RefreshDeps } from "./refresh";
import { fetchRecentVideoIds } from "./rss";
import { fetchVideoDetails, fetchChannelMeta, fetchUploadIds } from "./youtube";
import { fetchRoster } from "./twvtuber";
import { settleManualBackfill } from "./onboarding";
import { handleTwitchWebhook, refreshTwitch, tryRefreshTwitch } from "./twitch";
import { publishTwitchChanges } from "./twitch-publish";
import { boundedText } from "./twitch-api";
import { setTwitchHistoryPermission, twitchAccounts } from "./twitch-db";
import { z } from "zod";

export function routeCron(cron: string): "heavy" | "light" | "none" {
  if (cron === "0 0,6,12,18 * * *") return "heavy";
  if (cron === "*/5 * * * *") return "light";
  return "none";
}

function makeDeps(env: Env): RefreshDeps {
  return {
    fetchRecentVideoIds: (id) => fetchRecentVideoIds(id),
    fetchUploadIds: (playlistId) => fetchUploadIds(env.YOUTUBE_API_KEY, env.YT_REFERER, playlistId),
    fetchVideoDetails: (ids) => fetchVideoDetails(env.YOUTUBE_API_KEY, env.YT_REFERER, ids),
    fetchChannelMeta: (ids) => fetchChannelMeta(env.YOUTUBE_API_KEY, env.YT_REFERER, ids),
    fetchRoster: () => fetchRoster(env.TWVTUBER_BASE),
    now: () => new Date().toISOString(),
  };
}

function makeBackfillDeps(env: Env): BackfillDeps {
  return {
    fetchUploadIds: (playlistId) => fetchUploadIds(env.YOUTUBE_API_KEY, env.YT_REFERER, playlistId),
    fetchVideoDetails: (ids) => fetchVideoDetails(env.YOUTUBE_API_KEY, env.YT_REFERER, ids),
    now: () => new Date().toISOString(),
  };
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const mode = routeCron(event.cron);
    if (mode === "heavy") ctx.waitUntil(heavyRefresh(env, makeDeps(env)));
    else if (mode === "light") ctx.waitUntil((async () => {
      const now = new Date().toISOString();
      await tryRefreshTwitch(env, { now });
      try { await lightRefresh(env, makeDeps(env)); }
      catch (error) {
        await publishTwitchChanges(env, new Date().toISOString());
        throw error;
      }
    })());
  },

  // Optional curator-only manual trigger (token-gated) for debugging.
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/twitch/eventsub") {
      if (request.method !== "POST") return new Response("method not allowed", { status: 405, headers: { Allow: "POST" } });
      const response = await handleTwitchWebhook(request, env);
      if (response.status === 204 && ctx) ctx.waitUntil((async () => {
        await tryRefreshTwitch(env, { now: new Date().toISOString(), eventsOnly: true });
        await publishTwitchChanges(env, new Date().toISOString());
      })());
      return response;
    }
    if (url.pathname === "/twitch/accounts" || url.pathname === "/twitch/history" || url.pathname === "/twitch/refresh") {
      if (!env.MANUAL_TRIGGER_TOKEN || !await tokenMatches(request.headers.get("X-Trigger-Token") ?? "", env.MANUAL_TRIGGER_TOKEN)) {
        return new Response("forbidden", { status: 403 });
      }
      const headers = { "Cache-Control": "no-store" };
      if (url.pathname === "/twitch/accounts" && request.method === "GET") return Response.json(await twitchAccounts(env.DB), { headers });
      if (url.pathname === "/twitch/refresh" && request.method === "POST") {
        await refreshTwitch(env, { now: new Date().toISOString() });
        await publishTwitchChanges(env, new Date().toISOString());
        return Response.json({ ok: true }, { headers });
      }
      if (url.pathname === "/twitch/history" && request.method === "POST") {
        let permission: { userId: string; granted: boolean; evidence: string };
        try {
          permission = z.object({ userId: z.string().regex(/^\d+$/), granted: z.boolean(), evidence: z.string().trim().min(1).max(1000) })
            .parse(JSON.parse(await boundedText(request, 8192)));
        } catch { return Response.json({ error: "userId, granted and evidence are required" }, { status: 400, headers }); }
        const now = new Date().toISOString();
        if (!await setTwitchHistoryPermission(env.DB, permission.userId, permission.granted, permission.evidence, now)) {
          return Response.json({ error: "verified account not found" }, { status: 404, headers });
        }
        await publishTwitchChanges(env, now, true);
        await env.DB.prepare("DELETE FROM twitch_state WHERE key='subscriptions-checked'").run();
        return Response.json({ ok: true }, { headers });
      }
      return new Response("method not allowed", { status: 405 });
    }
    if (request.method === "POST" && url.pathname === "/refresh") {
      const token = env.MANUAL_TRIGGER_TOKEN;
      if (!token || request.headers.get("X-Trigger-Token") !== token) {
        return new Response("forbidden", { status: 403 });
      }
      // Recover a channel's older streams from its uploads playlist. Defaults to a dry
      // run so the cost and yield can be measured before anything is written.
      if (url.searchParams.get("mode") === "backfill") {
        const channelId = url.searchParams.get("channel") ?? "";
        if (!/^UC[\w-]{22}$/.test(channelId)) {
          return Response.json(
            { mode: "backfill", ok: false, error: "channel must be a UC... channel id" },
            { status: 400 },
          );
        }
        const dryRun = url.searchParams.get("dry") !== "0";
        try {
          const report = await backfillChannel(env, makeBackfillDeps(env), channelId, { dryRun });
          if (!dryRun) await settleManualBackfill(env.DB, report, new Date().toISOString());
          return Response.json({ mode: "backfill", ok: true, ...report });
        } catch (e) {
          return Response.json(
            { mode: "backfill", ok: false, error: (e as Error).message },
            { status: 500 },
          );
        }
      }

      const mode = url.searchParams.get("mode") === "light" ? "light" : "heavy";
      try {
        const snap = mode === "light" ? await lightRefresh(env, makeDeps(env)) : await heavyRefresh(env, makeDeps(env));
        return Response.json({ mode, ok: true, live: snap?.live.length ?? 0 });
      } catch (e) {
        // Return a readable error instead of an opaque platform 1101.
        return Response.json({ mode, ok: false, error: (e as Error).message }, { status: 500 });
      }
    }
    return new Response("not found", { status: 404 });
  },
};

async function tokenMatches(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(a!, b!);
}
