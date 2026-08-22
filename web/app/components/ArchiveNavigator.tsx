"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  archiveTotal, archiveYearMonths, archiveYears, formatArchiveMonth, latestArchiveMonth,
  stepArchiveMonth, type HistoryKind,
} from "@/lib/archive-nav";
import type { ArchiveIndex } from "@/lib/types";

const ACTIVE = "border-[var(--accent-pink)] bg-[var(--bg-accent-pink-muted)] text-text-primary";
const IDLE = [
  "border-[var(--border-default)] bg-[var(--bg-surface-muted)] text-text-secondary",
  "hover:border-[var(--text-tertiary)] hover:text-text-primary",
].join(" ");
const EMPTY = "border-transparent bg-transparent text-text-tertiary opacity-55";
const STEP = [
  "flex h-10 flex-none items-center gap-1.5 rounded-2xl bg-[var(--bg-surface-muted)] px-3 text-[12.5px]",
  "font-bold text-text-secondary tabular-nums transition-colors hover:text-text-primary",
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-secondary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
].join(" ");

/** "2025-11" → "2025/11", for the compact step buttons. */
const short = (month: string) => month.replace("-", "/");

/**
 * Reading 16,000 finished streams as one list is not a bandwidth problem — the whole
 * archive is ~1.6 MB gzipped — it is a DOM problem: every month adds ~7,400 nodes and
 * ~730 thumbnails. So history is navigated a month at a time rather than accumulated,
 * which keeps the rail bounded however far back you go.
 */
export default function ArchiveNavigator({
  index,
  kind,
  month,
  onSelect,
  onRetry,
  loading,
  error,
}: {
  index: ArchiveIndex;
  kind: HistoryKind;
  month: string | null;
  onSelect: (month: string) => void;
  onRetry: () => void;
  loading: boolean;
  error: boolean;
}) {
  const years = archiveYears(index, kind);
  const current = month ?? latestArchiveMonth(index, kind);
  if (years.length === 0 || !current) return null;

  const unit = kind === "recent" ? "場" : "筆";
  const year = current.slice(0, 4);
  const cells = archiveYearMonths(index, kind, year);
  const count = cells.find((cell) => cell.month === current)?.count ?? 0;
  const older = stepArchiveMonth(index, kind, current, -1);
  const newer = stepArchiveMonth(index, kind, current, 1);
  const since = archiveYearMonths(index, kind, years[0]!.year).find((cell) => cell.count > 0)?.month;

  return (
    <section aria-labelledby="archive-navigator-heading" className="glass mt-5 rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 id="archive-navigator-heading" className="text-[15px] font-extrabold text-text-primary">
            歷史封存
          </h2>
          <span className="text-xs text-text-secondary">選一個月份，一次只放一個月進時間軸</span>
        </div>
        <span className="text-xs font-semibold text-text-secondary tabular-nums">
          共 {archiveTotal(index, kind).toLocaleString()} {unit}
          {since ? ` · ${short(since)} 起` : ""}
        </span>
      </div>

      <div className="scrollbar-none mb-2.5 flex gap-1.5 overflow-x-auto">
        {years.map((entry) => {
          const active = entry.year === year;
          return (
            <button
              key={entry.year}
              type="button"
              aria-label={`${entry.year} 年`}
              aria-pressed={active}
              onClick={() => {
                const target = latestArchiveMonth(index, kind, entry.year);
                if (target) onSelect(target);
              }}
              className={[
                "flex h-11 min-w-[62px] flex-1 flex-col items-center justify-center rounded-2xl border",
                "text-sm font-extrabold tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
                active ? ACTIVE : IDLE,
              ].join(" ")}
            >
              <span>{entry.year}</span>
              <span className="text-[10px] font-semibold opacity-75">{entry.total.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {cells.map((cell) => {
          const active = cell.month === current;
          const empty = cell.count === 0;
          return (
            <button
              key={cell.month}
              type="button"
              aria-label={`${year} 年 ${Number(cell.month.slice(5))} 月`}
              aria-pressed={active}
              disabled={empty}
              onClick={() => onSelect(cell.month)}
              className={[
                "flex h-[52px] flex-col justify-center rounded-2xl border px-2.5 py-2 text-left transition-colors sm:px-3",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink",
                "disabled:cursor-not-allowed",
                active ? ACTIVE : empty ? EMPTY : IDLE,
              ].join(" ")}
            >
              <span className="text-[13px] font-extrabold">{cell.label}</span>
              <span className="text-[11px] font-semibold tabular-nums opacity-80">
                {empty ? "—" : `${cell.count.toLocaleString()} ${unit}`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-3.5">
        <button
          type="button"
          aria-label="更早的月份"
          disabled={!older || loading}
          onClick={() => older && onSelect(older)}
          className={STEP}
        >
          <ChevronLeft size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{older ? short(older) : "—"}</span>
        </button>

        <div role="status" aria-live="polite" className="min-w-0 text-center">
          <div className="text-[17px] font-extrabold tracking-tight text-text-primary tabular-nums">
            {formatArchiveMonth(current)}
          </div>
          <div className="text-xs text-text-secondary tabular-nums">
            {loading ? "載入中…" : error ? "載入失敗" : `${count.toLocaleString()} ${unit} · 由新到舊`}
          </div>
        </div>

        <button
          type="button"
          aria-label="更新的月份"
          disabled={!newer || loading}
          onClick={() => newer && onSelect(newer)}
          className={STEP}
        >
          <span>{newer ? short(newer) : "—"}</span>
          <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-pill bg-[var(--bg-surface-muted)] px-4 py-2 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            重新載入這個月
          </button>
        </div>
      )}
    </section>
  );
}
