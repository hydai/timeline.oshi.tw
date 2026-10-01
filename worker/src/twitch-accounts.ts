import type { PrismStreamer } from "./prism";
import type { RosterEntry } from "./types";

export function twitchLogin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let login = value.trim();
  if (/^https?:\/\//i.test(login)) {
    try {
      const url = new URL(login);
      if (!["twitch.tv", "www.twitch.tv"].includes(url.hostname.toLowerCase()) || url.username || url.password) return null;
      if (!/^\/[a-z0-9_]+\/?$/i.test(url.pathname)) return null;
      login = url.pathname.replace(/^\/|\/$/g, "");
    } catch { return null; }
  }
  return /^[a-z0-9_]{1,25}$/i.test(login) ? login.toLowerCase() : null;
}

export interface TwitchCandidate {
  channelId: string;
  login: string;
  source: "prism" | "twvtuber" | "both";
  conflict: boolean;
}

export function twitchCandidates(
  tracked: Set<string>, prism: PrismStreamer[], roster: Map<string, RosterEntry>,
): TwitchCandidate[] {
  const fromPrism = new Map(prism.map(s => [s.youtubeChannelId, s.twitchLogin]));
  const result: TwitchCandidate[] = [];
  for (const channelId of tracked) {
    const a = fromPrism.get(channelId), b = roster.get(channelId)?.twitchLogin;
    const login = a || b;
    if (!login) continue;
    result.push({ channelId, login, source: a && b ? "both" : a ? "prism" : "twvtuber", conflict: !!a && !!b && a !== b });
  }
  for (const row of result) {
    if (result.some(other => other.channelId !== row.channelId && other.login === row.login)) row.conflict = true;
  }
  return result;
}
