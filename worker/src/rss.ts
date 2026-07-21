const RSS_BASE = "https://www.youtube.com/feeds/videos.xml";
const VIDEO_ID_RE = /<yt:videoId>([\w-]+)<\/yt:videoId>/g;

/** Pure: extract deduped video ids from a channel RSS/Atom feed, in order. */
export function extractVideoIds(xml: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of xml.matchAll(VIDEO_ID_RE)) {
    const id = m[1]!;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Fetch a channel's recent video ids via RSS (0 YouTube quota). */
export async function fetchRecentVideoIds(channelId: string, limit = 10): Promise<string[]> {
  const url = `${RSS_BASE}?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RSS fetch failed for ${channelId} (${res.status})`);
  return extractVideoIds(await res.text()).slice(0, limit);
}
