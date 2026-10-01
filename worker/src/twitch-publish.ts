import { publishCurrentSnapshot } from "./refresh";
import { readSnapshot } from "./r2";
import type { Env, RosterEntry } from "./types";

/** Rebuild from D1, never append to an old snapshot. No YouTube network requests. */
export async function publishTwitchChanges(env: Env, now: string, forceArchive = false): Promise<void> {
  const previous = await readSnapshot(env.DATA_PUBLIC);
  if (!previous) return; // normal heavy bootstrap initializes channel metadata
  const roster = new Map<string, RosterEntry>();
  for (const [id, c] of Object.entries(previous.channels)) {
    if (c.twvtuber_id) roster.set(id, { youtubeId: id, twvtuberId: c.twvtuber_id,
      name: c.name, group: c.group, nationality: c.nationality, youtubeSubs: c.youtube_subs, avatar: c.avatar });
  }
  await publishCurrentSnapshot(env, roster, now, previous.heavy_refreshed_at, forceArchive ? "rewrite" : "current-month");
}
