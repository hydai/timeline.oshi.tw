export type StreamStatus = "live" | "upcoming" | "recent";
export type MilestoneType = "debut" | "anniversary" | "graduate";

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

export interface Milestone {
  channelId: string;
  type: MilestoneType;
  date: string;
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

// A unified river item (built in lib/timeline.ts).
export type TimelineItem =
  | { kind: "live" | "upcoming" | "recent"; sortAt: number; stream: SnapshotStream; channel: SnapshotChannel }
  | { kind: "milestone"; sortAt: number; milestone: Milestone; channel: SnapshotChannel };
