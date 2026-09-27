import { Cake, GraduationCap, PartyPopper, type LucideIcon } from "lucide-react";
import type { Milestone, SnapshotChannel } from "@/lib/types";
import { daysUntil, describeDaysUntil, milestoneLabel } from "@/lib/milestones";
import ChannelAvatar from "./ChannelAvatar";

const MILESTONE_ICON: Record<Milestone["type"], LucideIcon> = {
  debut: PartyPopper,
  anniversary: Cake,
  graduate: GraduationCap,
};

/**
 * A milestone on the rail. The day divider above it already gives the date, and says 今天
 * or 明天 when it is one of those, so the card says what the milestone is — which
 * anniversary — and, while it is further ahead, how long to wait.
 */
export default function MilestoneCard({ milestone, channel, debutYear, nowMs }: {
  milestone: Milestone;
  channel: SnapshotChannel;
  debutYear?: number;
  nowMs: number;
}) {
  const Icon = MILESTONE_ICON[milestone.type];
  const days = daysUntil(milestone.date, nowMs);

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
        <div className="truncate text-sm font-bold text-text-primary sm:text-[14.5px] sm:leading-5">{channel.name}</div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-[var(--text-accent-purple)]">{milestoneLabel(milestone, debutYear)}</span>
          {days > 1 && (
            <>
              <span className="text-text-tertiary" aria-hidden>·</span>
              <span className="text-text-secondary">{describeDaysUntil(days)}</span>
            </>
          )}
        </div>
      </div>
      {channel.group && (
        <span className="hidden flex-none rounded-pill px-3 py-1 text-xs font-extrabold sm:inline"
              style={{ background: "var(--bg-accent-pink-muted)", color: "var(--text-accent-purple)" }}>
          {channel.group}
        </span>
      )}
    </div>
  );
}
