"use client";

import { useId } from "react";
import {
  CalendarClock,
  CircleCheckBig,
  ListFilter,
  Radio,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { TimelineKind, TimelineKindCounts } from "@/lib/filter";

interface FilterOption {
  kind: TimelineKind | null;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  activeText: string;
  badge?: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { kind: null, label: "全部", ariaLabel: "全部類型", icon: ListFilter, activeText: "text-text-primary" },
  {
    kind: "live",
    label: "直播中",
    ariaLabel: "正在直播",
    icon: Radio,
    activeText: "text-[var(--text-accent-pink)]",
    badge: "bg-[var(--bg-accent-pink-muted)]",
  },
  {
    kind: "upcoming",
    label: "預定",
    ariaLabel: "預定直播",
    icon: CalendarClock,
    activeText: "text-[var(--text-accent-blue)]",
    badge: "bg-[var(--bg-accent-blue-muted)]",
  },
  { kind: "recent", label: "已完成", ariaLabel: "已完成直播", icon: CircleCheckBig, activeText: "text-text-primary" },
  { kind: "milestone", label: "里程碑", ariaLabel: "重要里程碑", icon: Trophy, activeText: "text-[var(--text-accent-purple)]" },
];

/**
 * A segmented control rather than a row of chips, so every type fits one row on a phone.
 * Only live and upcoming carry a count: they are what the page is opened for, while the
 * lifetime size of the archive says nothing about which type to look at next.
 */
export default function TimelineTypeFilter({
  counts,
  selected,
  onSelect,
}: {
  counts: TimelineKindCounts;
  selected: TimelineKind | null;
  onSelect: (kind: TimelineKind | null) => void;
}) {
  const baseId = useId();
  return (
    <section aria-labelledby="timeline-type-filter-heading" className="w-full min-w-0 md:w-auto">
      <h2 id="timeline-type-filter-heading" className="sr-only">
        依內容類型篩選
      </h2>
      <div className="flex gap-0.5 rounded-2xl bg-[var(--bg-surface-muted)] p-1">
        {FILTER_OPTIONS.map((option) => {
          const active = selected === option.kind;
          const Icon = option.icon;
          const count = option.badge && option.kind ? counts[option.kind] : null;
          const countId = `${baseId}-${option.kind}-count`;

          return (
            <button
              key={option.ariaLabel}
              type="button"
              aria-label={option.ariaLabel}
              aria-describedby={count !== null ? countId : undefined}
              aria-pressed={active}
              title={option.ariaLabel}
              onClick={() => onSelect(option.kind)}
              className={[
                // The tightest phones (320px) get a smaller label and gap so no type is cut short.
                "flex h-9 min-w-0 flex-auto items-center justify-center gap-0.5 rounded-xl px-1 text-[12px] font-bold whitespace-nowrap",
                "min-[360px]:gap-1 min-[360px]:text-[12.5px] sm:gap-1.5 sm:px-3 sm:text-[13px] md:flex-none",
                "transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink",
                active
                  ? `bg-[var(--bg-segment-active)] shadow-[var(--shadow-segment)] ${option.activeText}`
                  : "text-text-secondary hover:bg-[var(--bg-popover-hover)] hover:text-text-primary",
              ].join(" ")}
            >
              {option.kind === "live" && counts.live > 0 ? (
                <span className="hidden h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent-pink)] motion-safe:animate-pulse min-[360px]:block" aria-hidden />
              ) : (
                <Icon size={15} strokeWidth={2.4} className="hidden flex-none lg:block" aria-hidden />
              )}
              <span className="truncate">{option.label}</span>
              {count !== null && (
                <span
                  id={countId}
                  className={[
                    "min-w-4 flex-none rounded-full px-[3px] py-px text-center text-[10.5px] tabular-nums min-[360px]:min-w-[18px] min-[360px]:px-1",
                    count > 0 ? `${option.badge} text-text-primary` : "text-text-secondary",
                  ].join(" ")}
                >
                  {count}<span className="sr-only">場</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
