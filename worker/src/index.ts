import type { Env } from "./types";
import { backfillChannel, type BackfillDeps } from "./backfill";
import { heavyRefresh, lightRefresh, type RefreshDeps } from "./refresh";
import { fetchRecentVideoIds } from "./rss";
import { fetchVideoDetails, fetchChannelMeta, fetchUploadIds } from "./youtube";
import { fetchRoster } from "./twvtuber";

export function routeCron(cron: string): "heavy" | "light" | "none" {
  if (cron === "0 0,6,12,18 * * *") return "heavy";
  if (cron === "*/5 * * * *") return "light";
  return "none";
}

function makeDeps(env: Env): RefreshDeps {
  return {
    fetchRecentVideoIds: (id) => fetchRecentVideoIds(id),
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
    else if (mode === "light") ctx.waitUntil(lightRefresh(env, makeDeps(env)));
  },

  // Optional curator-only manual trigger (token-gated) for debugging.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
