import { Cake, GraduationCap, PartyPopper, type LucideIcon } from "lucide-react";
import type { Milestone, SnapshotChannel } from "@/lib/types";
import ChannelAvatar from "./ChannelAvatar";

const MILESTONE: Record<Milestone["type"], { label: string; Icon: LucideIcon }> = {
  debut: { label: "出道", Icon: PartyPopper },
  anniversary: { label: "週年", Icon: Cake },
  graduate: { label: "畢業", Icon: GraduationCap },
};

export default function MilestoneCard({ milestone, channel }: { milestone: Milestone; channel: SnapshotChannel }) {
  const { label, Icon } = MILESTONE[milestone.type];

  return (
    <div
      className="glass flex items-center gap-3 rounded-2xl p-3 sm:gap-3.5 sm:px-4"
      style={{ borderLeft: "3px solid var(--accent-purple)" }}
    >
      <span
        className="grid h-9 w-9 flex-none place-items-center rounded-xl sm:h-10 sm:w-10"
        style={{ background: "var(--bg-accent-pink-muted)", color: "var(--accent-purple)" }}
        aria-hidden
      >
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <span className="hidden sm:block">
        <ChannelAvatar src={channel.avatar} name={channel.name} size={34} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-text-primary sm:text-[14.5px]">{channel.name}</div>
        <div className="text-xs text-text-secondary">{label} · {milestone.date}</div>
      </div>
      {channel.group && (
        <span className="hidden flex-none rounded-pill px-3 py-1 text-xs font-extrabold sm:inline"
              style={{ background: "var(--bg-accent-pink-muted)", color: "var(--accent-purple)" }}>
          {channel.group}
        </span>
      )}
    </div>
  );
}
