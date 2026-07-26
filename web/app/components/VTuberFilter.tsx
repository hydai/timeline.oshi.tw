"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { VTuberFilterOption } from "@/lib/filter";

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("zh-TW") ?? "V";

  return (
    <span
      className="grid h-[46px] w-[46px] flex-none place-items-center overflow-hidden rounded-full border-2 border-[var(--border-glass)] bg-gradient-to-br from-accent-pink-light to-accent-blue-light text-base font-extrabold text-white shadow-sm"
      aria-hidden="true"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}

function chipClass(active: boolean): string {
  return [
    "flex w-[92px] min-w-[92px] snap-start flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2 max-[430px]:w-[82px] max-[430px]:min-w-[82px]",
    "transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink focus-visible:ring-offset-2",
    active
      ? "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)]"
      : "border-transparent bg-transparent",
  ].join(" ");
}

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
  return (
    <section aria-labelledby="vtuber-filter-heading">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-filter-muted)]">快速篩選</p>
        <h2 id="vtuber-filter-heading" className="mt-0.5 text-base font-extrabold tracking-tight text-text-primary">
          選擇 VTuber
        </h2>
      </div>
      <div className="scrollbar-none -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 pt-3">
        <button
          type="button"
          className={chipClass(selected == null)}
          onClick={() => onSelect(null)}
          aria-label="全部"
          aria-pressed={selected == null}
        >
          <span
            className="grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-[var(--border-glass)] bg-gradient-to-br from-accent-pink to-accent-purple text-white shadow-sm"
            aria-hidden="true"
          >
            <Sparkles size={19} />
          </span>
          <span className="w-full truncate text-[11px] font-bold text-text-primary">全部</span>
          <small className="text-[9px] tabular-nums text-[var(--text-filter-muted)]">{totalCount}</small>
        </button>
        {options.map((option) => (
          <button
            key={option.channelId}
            type="button"
            className={chipClass(selected === option.channelId)}
            onClick={() => onSelect(option.channelId)}
            aria-label={option.name}
            aria-pressed={selected === option.channelId}
          >
            <Avatar src={option.avatar} name={option.name} />
            <span className="w-full truncate text-[11px] font-bold text-text-primary" title={option.name}>
              {option.name}
            </span>
            <small className="text-[9px] tabular-nums text-[var(--text-filter-muted)]">{option.itemCount}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
