import type { ReactNode } from "react";
import type { TimelineItem } from "@/lib/types";
import StreamCard from "./StreamCard";
import MilestoneCard from "./MilestoneCard";
import EmptyState from "./EmptyState";

type Zone = "live" | "upcoming" | "past";

function zoneOf(kind: TimelineItem["kind"]): Zone {
  if (kind === "live") return "live";
  if (kind === "upcoming") return "upcoming";
  return "past";
}

const ZONE_LABEL: Record<Zone, string> = {
  live: "🔴 正在直播",
  upcoming: "📅 預定開台",
  past: "📚 歷史與里程碑",
};

export default function Timeline({ items, nowMs }: { items: TimelineItem[]; nowMs: number }) {
  if (items.length === 0) return <EmptyState />;

  const nodes: ReactNode[] = [];
  let prevZone: Zone | null = null;
  for (const it of items) {
    const zone = zoneOf(it.kind);
    if (zone !== prevZone) {
      nodes.push(
        <h2 key={`hdr-${zone}`} className="mt-4 mb-1 px-1 text-sm font-bold text-text-secondary first:mt-0">
          {ZONE_LABEL[zone]}
        </h2>
      );
      prevZone = zone;
    }
    nodes.push(
      it.kind === "milestone" ? (
        <MilestoneCard key={`m-${it.milestone.channelId}-${it.milestone.type}-${it.milestone.date}`} milestone={it.milestone} channel={it.channel} />
      ) : (
        <StreamCard key={`${it.kind}-${it.stream.videoId}`} kind={it.kind} stream={it.stream} channel={it.channel} nowMs={nowMs} />
      )
    );
  }

  return <div className="flex flex-col gap-3">{nodes}</div>;
}
