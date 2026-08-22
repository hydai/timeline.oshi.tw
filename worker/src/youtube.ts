import type { StreamRecord, StreamStatus, ChannelMeta } from "./types";

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

interface PlaylistItemsResponse {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}

/**
 * Every video a channel has uploaded, newest first.
 *
 * The RSS feed used for routine discovery only carries the latest ~15, which is why
 * stream history starts at the day we began scanning. The uploads playlist pages
 * through everything at 1 quota unit per 50 — search.list would be 100 a call.
 *
 * `maxPages` is a hard stop so a single channel with a huge back catalogue cannot
 * consume the day's quota — 200 pages is 10,000 videos, far beyond any real channel,
 * and still only 200 units. `truncated` reports whether it was hit: a silent cut-off
 * reads as "this channel only has N videos", which is the wrong conclusion to draw
 * when judging whether a backfill is complete.
 */
export async function fetchUploadIds(
  apiKey: string,
  referer: string,
  playlistId: string,
  maxPages = 200,
): Promise<{ ids: string[]; truncated: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${YT_API}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Referer: referer } });
    if (!res.ok) throw new Error(`playlistItems.list failed (${res.status}): ${await res.text()}`);

    const data = (await res.json()) as PlaylistItemsResponse;
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    truncated = page === maxPages - 1;
  }

  return { ids, truncated };
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

export interface YtChannelItem {
  id: string;
  snippet: {
    title: string;
    thumbnails: { default?: { url: string }; medium?: { url: string }; high?: { url: string } };
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface ChannelsResponse { items?: YtChannelItem[] }

export function normalizeChannel(item: YtChannelItem): ChannelMeta {
  const t = item.snippet.thumbnails;
  return {
    channelId: item.id,
    name: item.snippet.title,
    avatarUrl: t.high?.url ?? t.medium?.url ?? t.default?.url ?? "",
    uploadsPlaylist: item.contentDetails?.relatedPlaylists?.uploads ?? uploadsPlaylistId(item.id),
  };
}

/** Batch fetch channel metadata. 1 quota unit per 50 ids. */
export async function fetchChannelMeta(apiKey: string, referer: string, ids: string[]): Promise<ChannelMeta[]> {
  const out: ChannelMeta[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = new URL(`${YT_API}/channels`);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString(), { headers: { Referer: referer } });
    if (!res.ok) throw new Error(`channels.list failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as ChannelsResponse;
    for (const item of data.items ?? []) out.push(normalizeChannel(item));
  }
  return out;
}
