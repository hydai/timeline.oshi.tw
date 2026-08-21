"use client";

import { Building2, ChevronDown } from "lucide-react";
import {
  UNGROUPED_FILTER_VALUE,
  type GroupFilterOption,
  type GroupFilterValue,
} from "@/lib/filter";
import { usePopover } from "./usePopover";

function Option({ name, count, active, empty, onSelect }: {
  name: string; count: number; active: boolean; empty: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      onClick={onSelect}
      className={[
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
        active
          ? "bg-[var(--bg-accent-pink-muted)] text-text-primary"
          : "text-text-secondary hover:bg-[var(--bg-surface-muted)] hover:text-text-primary",
        empty && !active ? "opacity-50" : "",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-[11px] tabular-nums text-text-secondary">{count}</span>
    </button>
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
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const active = options.find((option) => option.value === selected);

  const choose = (group: GroupFilterValue) => {
    onSelect(group);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-label="所屬團體篩選"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className={[
          "flex h-11 items-center gap-1.5 rounded-2xl px-3 text-[13px] font-bold",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
          selected
            ? "bg-[var(--bg-accent-pink-muted)] text-[var(--accent-pink-dark)]"
            : "bg-[var(--bg-surface-muted)] text-text-secondary hover:text-text-primary",
        ].join(" ")}
      >
        <Building2 size={15} strokeWidth={2.2} aria-hidden />
        <span className="max-w-[84px] truncate">{active?.name ?? "所屬團體"}</span>
        <ChevronDown size={13} strokeWidth={2.4} aria-hidden />
      </button>

      {open && (
        <div className="glass absolute left-0 top-[52px] z-50 w-[232px] rounded-2xl p-1.5 shadow-2xl">
          <Option
            name="全部團體"
            count={totalCount}
            active={selected == null}
            empty={false}
            onSelect={() => choose(null)}
          />
          {options.map((option) => (
            <Option
              key={option.value}
              name={option.name}
              count={option.itemCount}
              active={selected === option.value}
              empty={option.itemCount === 0}
              onSelect={() => choose(option.value === UNGROUPED_FILTER_VALUE ? UNGROUPED_FILTER_VALUE : option.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
