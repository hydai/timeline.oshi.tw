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

export interface ArchiveMonthSummary {
  month: string;
  streams: number;
  milestones: number;
}

export interface ArchiveIndex {
  version: "1.0.0";
  generated_at: string;
  months: ArchiveMonthSummary[];
}

export interface ArchiveMonth {
  version: "1.0.0";
  generated_at: string;
  month: string;
  channels: Record<string, SnapshotChannel>;
  streams: SnapshotStream[];
  milestones: Milestone[];
}

// A unified river item (built in lib/timeline.ts).
type StreamTimelineItem = {
  [Kind in "live" | "upcoming" | "recent"]: {
    kind: Kind;
    sortAt: number;
    stream: SnapshotStream;
    channel: SnapshotChannel;
  }
}["live" | "upcoming" | "recent"];

export type TimelineItem = StreamTimelineItem
  | { kind: "milestone"; sortAt: number; milestone: Milestone; channel: SnapshotChannel };
