import type { Milestone, SnapshotChannel } from "@/lib/types";

const MILESTONE: Record<Milestone["type"], { emoji: string; label: string }> = {
  debut: { emoji: "🎉", label: "出道" },
  anniversary: { emoji: "🎂", label: "週年" },
  graduate: { emoji: "🎓", label: "畢業" },
};

export default function MilestoneCard({ milestone, channel }: { milestone: Milestone; channel: SnapshotChannel }) {
  const m = MILESTONE[milestone.type];
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <span className="text-2xl" aria-hidden>{m.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-text-primary">{channel.name}</div>
        <div className="text-xs text-text-tertiary">{m.label} · {milestone.date}</div>
      </div>
    </div>
  );
}
