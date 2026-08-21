"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import type { VTuberFilterOption } from "@/lib/filter";
import ChannelAvatar from "./ChannelAvatar";
import { usePopover } from "./usePopover";

export default function VTuberFilter({
  options,
  selected,
  totalCount,
  onSelect,
}: {
  options: VTuberFilterOption[];
  selected: string | null;
  totalCount: number;
  onSelect: (channelId: string | null) => void;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const active = options.find((option) => option.channelId === selected);

  const choose = (channelId: string | null) => {
    onSelect(channelId);
    setOpen(false);
  };

  const cell = [
    "flex flex-col items-center gap-1.5 rounded-xl px-1 py-1.5",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
  ].join(" ");

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-label="VTuber 篩選"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className={[
          "flex h-11 items-center gap-2 rounded-2xl py-0 pl-2 pr-3 text-[13px] font-bold",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
          selected
            ? "bg-[var(--bg-accent-pink-muted)] text-[var(--accent-pink-dark)]"
            : "bg-[var(--bg-surface-muted)] text-text-secondary hover:text-text-primary",
        ].join(" ")}
      >
        <span className="flex items-center" aria-hidden>
          {(active ? [active] : options.slice(0, 3)).map((option, index) => (
            <span key={option.channelId} style={index > 0 ? { marginLeft: -9 } : undefined}>
              <ChannelAvatar src={option.avatar} name={option.name} size={24} className="border-2 border-[var(--border-glass)]" />
            </span>
          ))}
        </span>
        <span className="max-w-[88px] truncate">{active?.name ?? "VTuber"}</span>
        <ChevronDown size={13} strokeWidth={2.4} aria-hidden />
      </button>

      {open && (
        <div className="glass absolute left-0 top-[52px] z-50 w-[300px] rounded-2xl p-2.5 shadow-2xl sm:w-[320px]">
          <p className="mb-2 ml-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--text-filter-muted)]">
            此區間有動態的頻道
          </p>
          <div className="scrollbar-none grid max-h-[280px] grid-cols-5 gap-2 overflow-y-auto">
            <button
              type="button"
              aria-label="全部"
              aria-pressed={selected == null}
              onClick={() => choose(null)}
              className={`${cell} ${selected == null ? "bg-[var(--bg-accent-pink-muted)]" : "hover:bg-[var(--bg-surface-muted)]"}`}
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full text-white"
                style={{ background: "linear-gradient(135deg, var(--accent-pink), var(--accent-purple))" }}
                aria-hidden
              >
                <Sparkles size={17} />
              </span>
              <small className="w-full truncate text-center text-[10px] font-bold text-text-secondary">全部</small>
              <small className="text-[9px] tabular-nums text-[var(--text-filter-muted)]">{totalCount}</small>
            </button>

            {options.map((option) => {
              const isActive = selected === option.channelId;
              return (
                <button
                  key={option.channelId}
                  type="button"
                  aria-label={option.name}
                  aria-pressed={isActive}
                  title={option.name}
                  onClick={() => choose(option.channelId)}
                  className={`${cell} ${isActive ? "bg-[var(--bg-accent-pink-muted)]" : "hover:bg-[var(--bg-surface-muted)]"}`}
                >
                  <ChannelAvatar src={option.avatar} name={option.name} size={40} className="border-2 border-[var(--border-glass)]" />
                  <small className="w-full truncate text-center text-[10px] font-bold text-text-secondary">
                    {option.name}
                  </small>
                  <small className="text-[9px] tabular-nums text-[var(--text-filter-muted)]">{option.itemCount}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
