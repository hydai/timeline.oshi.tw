export interface Env {
  DB: D1Database;
  DATA_PUBLIC: R2Bucket;
  YOUTUBE_API_KEY: string;
  TWVTUBER_BASE: string;
  YT_REFERER: string;
  MANUAL_TRIGGER_TOKEN?: string;
}

export type StreamStatus = "live" | "upcoming" | "ended";

export interface StreamRecord {
  videoId: string;
  channelId: string;
  status: StreamStatus;
  title: string;
  thumbnailUrl: string | null;
  scheduledStart: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  concurrentViewers: number | null;
}

export interface ChannelMeta {
  channelId: string;
  name: string;
  avatarUrl: string;
  uploadsPlaylist: string;
}

export interface ChannelRow {
  channel_id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  uploads_playlist: string | null;
  enabled: number;
  added_at: string;
  meta_checked_at: string | null;
}

export interface RosterEntry {
  youtubeId: string;
  name: string;
  group: string | null;
  nationality: string | null;
  youtubeSubs: number | null;
  avatar: string | null;
  twvtuberId: string;
}

export interface Milestone {
  channelId: string;
  type: "debut" | "anniversary" | "graduate";
  date: string;
}

export interface SnapshotChannel {
  name: string;
  handle: string | null;
  avatar: string | null;
  group: string | null;
  nationality: string | null;
  youtube_subs: number | null;
  twvtuber_id: string | null;
}

export interface SnapshotStream {
  videoId: string;
  channelId: string;
  title: string;
  thumbnail: string | null;
  url: string;
  actualStart?: string;
  scheduledStart?: string;
  actualEnd?: string;
  concurrentViewers?: number;
}

export interface Snapshot {
  version: "1.0.0";
  generated_at: string;
  heavy_refreshed_at: string;
  channels: Record<string, SnapshotChannel>;
  groups: string[];
  live: SnapshotStream[];
  upcoming: SnapshotStream[];
  recent: SnapshotStream[];
  milestones: Milestone[];
}
