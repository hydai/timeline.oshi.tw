import type { TimelineItem } from "@/lib/types";
import { daysUntil, describeDaysUntil, milestoneLabel } from "@/lib/milestones";
import { formatCalendarDay } from "@/lib/time";
import ChannelAvatar from "./ChannelAvatar";
import { MILESTONE_ICON } from "./MilestoneCard";

export type MilestoneItem = Extract<TimelineItem, { kind: "milestone" }>;

/**
 * Today's day and countdown are ringed in pink, like the rail's 現在. Their text stays
 * ink: pink on pink is too faint to read.
 */
const TODAY = "bg-[var(--bg-accent-pink-muted)] text-text-primary ring-1 ring-[var(--accent-pink)]";

/**
 * Milestones as an agenda rather than a rail: one compact row each, dated in its own
 * column, so a month of anniversaries reads at a glance instead of one per screen.
 * Ahead of time a row also counts down; today's is picked out.
 */
export default function MilestoneList({ items, nowMs, debutYears, upcoming }: {
  items: MilestoneItem[];
  nowMs: number;
  debutYears: Map<string, number>;
  upcoming: boolean;
}) {
  return (
    <ol className="glass divide-y divide-[var(--border-default)] overflow-hidden rounded-3xl">
      {items.map(({ milestone, channel }) => {
        const { monthDay, weekday } = formatCalendarDay(milestone.date);
        const days = daysUntil(milestone.date, nowMs);
        const today = upcoming && days === 0;
        const Icon = MILESTONE_ICON[milestone.type];
        return (
          <li
            key={`${milestone.channelId}:${milestone.type}:${milestone.date}`}
            className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4"
          >
            <span
              className={[
                "flex w-12 flex-none flex-col items-center rounded-xl py-1.5 sm:w-14",
                today ? TODAY : "bg-[var(--bg-surface-muted)] text-text-primary",
              ].join(" ")}
            >
              <span className="text-[15px] font-extrabold leading-5 tabular-nums">{monthDay}</span>
              <span className={`text-[11px] font-semibold ${today ? "" : "text-text-secondary"}`}>{weekday}</span>
            </span>
            <ChannelAvatar src={channel.avatar} name={channel.name} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-text-primary">{channel.name}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <Icon size={13} strokeWidth={2.2} className="flex-none text-[var(--text-accent-purple)]" aria-hidden />
                <span className="flex-none font-semibold text-[var(--text-accent-purple)]">
                  {milestoneLabel(milestone, debutYears.get(milestone.channelId))}
                </span>
                {channel.group && (
                  <>
                    <span className="text-text-tertiary" aria-hidden>·</span>
                    <span className="truncate text-text-secondary">{channel.group}</span>
                  </>
                )}
              </span>
            </span>
            {upcoming && days >= 0 && (
              <span
                className={[
                  "flex-none rounded-pill px-2.5 py-1 text-xs font-bold tabular-nums",
                  today ? TODAY : "bg-[var(--bg-surface-muted)] text-text-secondary",
                ].join(" ")}
              >
                {describeDaysUntil(days)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
