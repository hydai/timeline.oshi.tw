/** Pure: classify a YouTube URL as a channel id or a handle. */
export function parseYoutubeLink(link: string): { channelId?: string; handle?: string } {
  try {
    const u = new URL(link);
    const path = decodeURIComponent(u.pathname);
    const chan = path.match(/\/channel\/(UC[\w-]+)/);
    if (chan) return { channelId: chan[1] };
    const handle = path.match(/\/@([^/]+)/);
    if (handle) return { handle: "@" + handle[1] };
    return {}; // legacy /c/ custom urls need an online lookup
  } catch {
    return {};
  }
}
