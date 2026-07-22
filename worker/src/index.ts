import type { Env } from "./types";
import { heavyRefresh, lightRefresh, type RefreshDeps } from "./refresh";
import { fetchRecentVideoIds } from "./rss";
import { fetchVideoDetails, fetchChannelMeta } from "./youtube";
import { fetchRoster, fetchMilestones } from "./twvtuber";

export function routeCron(cron: string): "heavy" | "light" | "none" {
  if (cron === "0 0,6,12,18 * * *") return "heavy";
  if (cron === "*/30 * * * *") return "light";
  return "none";
}

function makeDeps(env: Env): RefreshDeps {
  return {
    fetchRecentVideoIds: (id) => fetchRecentVideoIds(id),
    fetchVideoDetails: (ids) => fetchVideoDetails(env.YOUTUBE_API_KEY, env.YT_REFERER, ids),
    fetchChannelMeta: (ids) => fetchChannelMeta(env.YOUTUBE_API_KEY, env.YT_REFERER, ids),
    fetchRoster: () => fetchRoster(env.TWVTUBER_BASE),
    fetchMilestones: (tracked, now) => fetchMilestones(env.TWVTUBER_BASE, tracked, now),
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
