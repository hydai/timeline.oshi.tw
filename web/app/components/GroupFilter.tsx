"use client";

import { Building2, LayoutGrid, UserRound } from "lucide-react";
import {
  UNGROUPED_FILTER_VALUE,
  type GroupFilterOption,
  type GroupFilterValue,
} from "@/lib/filter";

function buttonClass(active: boolean, empty = false): string {
  return [
    "flex min-w-[148px] snap-start items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left lg:w-full lg:min-w-0",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink focus-visible:ring-offset-2",
    active
      ? "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)] text-text-primary"
      : "border-transparent bg-transparent text-text-secondary hover:bg-[var(--bg-surface-muted)] hover:text-text-primary",
    empty && !active ? "opacity-60" : "",
  ].join(" ");
}

function FilterIcon({ value }: { value: string | null }) {
  const Icon = value == null
    ? LayoutGrid
    : value === UNGROUPED_FILTER_VALUE
      ? UserRound
      : Building2;

  return (
    <span
      className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[var(--bg-surface-muted)] text-[var(--accent-pink-dark)]"
      aria-hidden="true"
    >
      <Icon size={16} strokeWidth={2.3} />
    </span>
  );
}

function Count({ children }: { children: number }) {
  return (
    <span className="ml-auto rounded-full bg-[var(--bg-surface-muted)] px-2 py-0.5 text-[10px] tabular-nums text-text-secondary">
      {children}
    </span>
  );
}

export default function GroupFilter({
  options,
  selected,
  totalCount,
  onSelect,
}: {
  options: GroupFilterOption[];
  selected: GroupFilterValue;
  totalCount: number;
  onSelect: (group: GroupFilterValue) => void;
}) {
  return (
    <section
      aria-labelledby="group-filter-heading"
      className="glass rounded-2xl p-3 shadow-sm lg:sticky lg:top-6"
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-filter-muted)]">
          快速篩選
        </p>
        <h2 id="group-filter-heading" className="mt-0.5 text-base font-extrabold tracking-tight text-text-primary">
          所屬團體
        </h2>
      </div>
      <div className="scrollbar-none -mx-1 mt-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        <button
          type="button"
          className={buttonClass(selected == null)}
          onClick={() => onSelect(null)}
          aria-label="全部團體"
          aria-pressed={selected == null}
        >
          <FilterIcon value={null} />
          <span className="truncate text-xs font-bold">全部</span>
          <Count>{totalCount}</Count>
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={buttonClass(selected === option.value, option.itemCount === 0)}
            onClick={() => onSelect(option.value)}
            aria-label={option.name}
            aria-pressed={selected === option.value}
            title={option.name}
          >
            <FilterIcon value={option.value} />
            <span className="min-w-0 truncate text-xs font-bold">{option.name}</span>
            <Count>{option.itemCount}</Count>
          </button>
        ))}
      </div>
    </section>
  );
}
