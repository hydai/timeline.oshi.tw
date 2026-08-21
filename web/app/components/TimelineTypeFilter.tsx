"use client";

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
  activeClass: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    kind: null,
    label: "全部",
    ariaLabel: "全部類型",
    icon: ListFilter,
    activeClass: "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)] text-[var(--accent-pink-dark)]",
  },
  {
    kind: "live",
    label: "正在直播",
    ariaLabel: "正在直播",
    icon: Radio,
    activeClass: "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)] text-[var(--accent-pink-dark)]",
  },
  {
    kind: "upcoming",
    label: "預定直播",
    ariaLabel: "預定直播",
    icon: CalendarClock,
    activeClass: "border-[var(--accent-blue)] bg-[var(--bg-accent-blue-muted)] text-[var(--accent-blue)]",
  },
  {
    kind: "recent",
    label: "已完成",
    ariaLabel: "已完成直播",
    icon: CircleCheckBig,
    activeClass: "border-[var(--text-secondary)] bg-[var(--bg-surface-muted)] text-text-primary",
  },
  {
    kind: "milestone",
    label: "里程碑",
    ariaLabel: "重要里程碑",
    icon: Trophy,
    activeClass: "border-[var(--accent-purple)] bg-[var(--bg-accent-pink-muted)] text-[var(--accent-purple)]",
  },
];

function countForOption(
  kind: TimelineKind | null,
  counts: TimelineKindCounts,
): number {
  if (kind) return counts[kind];
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export default function TimelineTypeFilter({
  counts,
  selected,
  onSelect,
}: {
  counts: TimelineKindCounts;
  selected: TimelineKind | null;
  onSelect: (kind: TimelineKind | null) => void;
}) {
  return (
    <section
      aria-labelledby="timeline-type-filter-heading"
      className="w-full min-w-0 lg:w-auto"
    >
      <h2 id="timeline-type-filter-heading" className="sr-only">
        依內容類型篩選
      </h2>
      <div className="scrollbar-none flex snap-x gap-1 overflow-x-auto">
        {FILTER_OPTIONS.map((option) => {
          const active = selected === option.kind;
          const Icon = option.icon;

          return (
            <button
              key={option.ariaLabel}
              type="button"
              aria-label={option.ariaLabel}
              aria-pressed={active}
              title={option.ariaLabel}
              onClick={() => onSelect(option.kind)}
              className={[
                "flex h-11 flex-none snap-start items-center justify-center gap-1.5 rounded-2xl border px-3 text-[13px] font-bold whitespace-nowrap",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
                active
                  ? option.activeClass
                  : "border-transparent bg-transparent text-text-secondary hover:bg-[var(--bg-surface-muted)] hover:text-text-primary",
              ].join(" ")}
            >
              <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
              <span>{option.label}</span>
              <span className="rounded-full bg-[var(--bg-surface-muted)] px-1.5 py-0.5 text-[10.5px] tabular-nums text-text-secondary">
                {countForOption(option.kind, counts)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
