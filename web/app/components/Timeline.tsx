import type { TimelineItem } from "@/lib/types";
import StreamCard from "./StreamCard";
import MilestoneCard from "./MilestoneCard";
import EmptyState from "./EmptyState";

export default function Timeline({ items, nowMs }: { items: TimelineItem[]; nowMs: number }) {
  if (items.length === 0) return <EmptyState />;
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) =>
        it.kind === "milestone" ? (
          <MilestoneCard key={`m-${it.milestone.channelId}-${it.milestone.date}`} milestone={it.milestone} channel={it.channel} />
        ) : (
          <StreamCard key={it.stream.videoId} kind={it.kind} stream={it.stream} channel={it.channel} nowMs={nowMs} />
        )
      )}
    </div>
  );
}
