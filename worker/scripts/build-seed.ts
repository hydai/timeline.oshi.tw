// One-time: resolve prism registry YouTube links → channel ids, drop hololive.
// Usage: YOUTUBE_API_KEY=... npm run build:seed -- [path/to/registry.json]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseYoutubeLink } from "../src/seed";

const REGISTRY = process.argv[2] ?? "../../prism.oshi.tw/data/registry.json";
const API_KEY = process.env.YOUTUBE_API_KEY;
const TWVTUBER = process.env.TWVTUBER_BASE ?? "https://twvtuber.oshi.tw";
const REFERER = "https://timeline.oshi.tw/";

// Authoritative ids from prism NOVA (submissions.youtube_channel_id).
const NOVA_KNOWN: Record<string, string> = {
  mizuki: "UCjv4bfP_67WLuPheS-Z8Ekg",
  gabu: "UCCHsCWNTcGJ8Jml_oZ6nG2Q",
};
// Known hololive handles to exclude regardless of twvtuber grouping.
const HOLOLIVE_HANDLES = new Set(["@minatoaqua"]);

interface Streamer { slug: string; socialLinks?: { youtube?: string } }

async function resolveHandle(handle: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id");
  url.searchParams.set("forHandle", handle.replace(/^@/, ""));
  url.searchParams.set("key", API_KEY!);
  const res = await fetch(url.toString(), { headers: { Referer: REFERER } });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ id: string }> };
  return data.items?.[0]?.id ?? null;
}

async function hololiveChannelIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${TWVTUBER}/v1/vtubers?region=TW&activity=active&limit=100&offset=${offset}`);
    if (!res.ok) break;
    const data = (await res.json()) as { results?: Array<{ youtube_id: string | null; group_name: string | null }> };
    const page = data.results ?? [];
    for (const v of page) if (v.youtube_id && /hololive/i.test(v.group_name ?? "")) ids.add(v.youtube_id);
    if (page.length < 100) break;
  }
  return ids;
}

async function main() {
  if (!API_KEY) throw new Error("YOUTUBE_API_KEY required (handle resolution)");
  const reg = JSON.parse(readFileSync(REGISTRY, "utf8")) as { streamers: Streamer[] };
  const holo = await hololiveChannelIds();
  const seen = new Set<string>();
  const out: Array<{ channelId: string; handle: string | null }> = [];

  for (const s of reg.streamers) {
    const link = s.socialLinks?.youtube;
    if (!link) continue;
    const parsed = parseYoutubeLink(link);
    if (parsed.handle && HOLOLIVE_HANDLES.has(parsed.handle)) { console.warn(`skip hololive ${parsed.handle}`); continue; }
    let channelId = NOVA_KNOWN[s.slug] ?? parsed.channelId ?? null;
    if (!channelId && parsed.handle) channelId = await resolveHandle(parsed.handle);
    if (!channelId) { console.warn(`unresolved: ${s.slug} (${link})`); continue; }
    if (holo.has(channelId)) { console.warn(`skip hololive ${s.slug} ${channelId}`); continue; }
    if (seen.has(channelId)) continue;
    seen.add(channelId);
    out.push({ channelId, handle: parsed.handle ?? null });
  }

  mkdirSync("seed", { recursive: true });
  writeFileSync("seed/channels.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote seed/channels.json (${out.length} channels)`);
}

main();
