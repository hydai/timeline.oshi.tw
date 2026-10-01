import { publishCurrentSnapshot } from "./refresh";
import type { Env } from "./types";

/** Rebuild from D1, never append to an old snapshot. No YouTube network requests. */
export async function publishTwitchChanges(env: Env, now: string, forceArchive = false): Promise<void> {
  await publishCurrentSnapshot(env, null, now, null, forceArchive ? "rewrite" : "current-month");
}

/** Retry committed permission changes independently of Twitch/YouTube API health. */
export async function retryPendingTwitchPublication(env: Env, now: string): Promise<void> {
  const pending = await env.DB.prepare("SELECT 1 FROM twitch_state WHERE key='consent-publication-pending'").first();
  if (pending) await publishTwitchChanges(env, now, true);
}
