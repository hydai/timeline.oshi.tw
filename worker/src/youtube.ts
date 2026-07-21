import type { StreamRecord, StreamStatus } from "./types";

const YT_API = "https://www.googleapis.com/youtube/v3";

export interface YtVideoItem {
  id: string;
  snippet: {
    channelId: string;
    title: string;
    liveBroadcastContent: string; // "live" | "upcoming" | "none"
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    concurrentViewers?: string;
  };
}

interface VideosResponse { items?: YtVideoItem[] }

export function uploadsPlaylistId(channelId: string): string {
  return channelId.startsWith("UC") ? "UU" + channelId.slice(2) : channelId;
}

function bestThumb(t: YtVideoItem["snippet"]["thumbnails"]): string | null {
  return t.high?.url ?? t.medium?.url ?? t.default?.url ?? null;
}

export function normalizeVideo(item: YtVideoItem): StreamRecord {
  const lbc = item.snippet.liveBroadcastContent;
  const status: StreamStatus = lbc === "live" ? "live" : lbc === "upcoming" ? "upcoming" : "ended";
  const d = item.liveStreamingDetails ?? {};
  return {
    videoId: item.id,
    channelId: item.snippet.channelId,
    status,
    title: item.snippet.title,
    thumbnailUrl: bestThumb(item.snippet.thumbnails),
    scheduledStart: d.scheduledStartTime ?? null,
    actualStart: d.actualStartTime ?? null,
    actualEnd: d.actualEndTime ?? null,
    concurrentViewers: d.concurrentViewers != null ? parseInt(d.concurrentViewers, 10) : null,
  };
}

/** Batch fetch video status. 1 quota unit per 50 ids. Never uses search.list. */
export async function fetchVideoDetails(apiKey: string, referer: string, ids: string[]): Promise<StreamRecord[]> {
  const out: StreamRecord[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = new URL(`${YT_API}/videos`);
    url.searchParams.set("part", "snippet,liveStreamingDetails,contentDetails");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString(), { headers: { Referer: referer } });
    if (!res.ok) throw new Error(`videos.list failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as VideosResponse;
    for (const item of data.items ?? []) out.push(normalizeVideo(item));
  }
  return out;
}
