import type { YtVideoItem } from "../../src/youtube";

export const liveItem: YtVideoItem = {
  id: "vLive", snippet: {
    channelId: "UCaaa", title: "深夜雜談", liveBroadcastContent: "live",
    thumbnails: { medium: { url: "https://thumb/med" } },
  },
  liveStreamingDetails: { actualStartTime: "2026-07-21T14:00:00Z", concurrentViewers: "321" },
};

export const upcomingItem: YtVideoItem = {
  id: "vUp", snippet: {
    channelId: "UCaaa", title: "預定歌回", liveBroadcastContent: "upcoming",
    thumbnails: { high: { url: "https://thumb/high" } },
  },
  liveStreamingDetails: { scheduledStartTime: "2026-07-22T12:00:00Z" },
};

export const endedItem: YtVideoItem = {
  id: "vEnd", snippet: {
    channelId: "UCaaa", title: "已結束", liveBroadcastContent: "none",
    thumbnails: { default: { url: "https://thumb/def" } },
  },
  liveStreamingDetails: { actualStartTime: "2026-07-20T10:00:00Z", actualEndTime: "2026-07-20T12:00:00Z" },
};

export const plainUpload: YtVideoItem = {
  id: "vPlain", snippet: { channelId: "UCaaa", title: "一般影片", liveBroadcastContent: "none", thumbnails: {} },
};
