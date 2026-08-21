"use client";
import { useMemo, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { buildRail, type RailMode, type RailRow } from "@/lib/rail";
import { timelineItemKey } from "@/lib/timeline";
import type { TimelineItem } from "@/lib/types";
import StreamCard from "./StreamCard";
import MilestoneCard from "./MilestoneCard";
import ChannelAvatar from "./ChannelAvatar";
import EmptyState from "./EmptyState";

const GRID = "grid grid-cols-[52px_18px_minmax(0,1fr)] items-start sm:grid-cols-[76px_22px_minmax(0,1fr)]";
/** The rail line overshoots the row gap so it reads as one continuous line, not a dotted one. */
const LINE = "absolute left-[8px] top-0 -bottom-3 w-0.5 rounded bg-[var(--rail)] sm:left-[10px]";
const DOT = "absolute left-[4px] top-3 h-2.5 w-2.5 rounded-full sm:left-[5px] sm:top-4 sm:h-3 sm:w-3";

function Row({ time, node, children }: { time?: ReactNode; node: ReactNode; children: ReactNode }) {
  return (
    <div className={GRID}>
      <div className="pr-2 pt-2.5 text-right text-[11.5px] font-bold tabular-nums sm:pr-3.5 sm:pt-3.5 sm:text-[13.5px]">
        {time}
      </div>
      <div className="relative self-stretch">{node}</div>
      <div className="pl-2.5 sm:pl-3.5">{children}</div>
    </div>
  );
}

function DayRow({ row }: { row: Extract<RailRow, { type: "day" }> }) {
  return (
    <div className={GRID}>
      <div />
      <div className="relative self-stretch">
        <span className={`${LINE} top-5 sm:top-6`} />
        <span
          className="absolute left-[3px] top-3 h-3.5 w-3.5 rounded-full sm:left-1 sm:top-[18px]"
          style={{
            // Today's marker is the anchor of the whole rail; other days stay quiet.
            background: row.isToday ? "var(--accent-pink)" : "var(--rail)",
            boxShadow: `0 0 0 4px ${row.isToday ? "var(--bg-accent-pink-muted)" : "var(--bg-surface-muted)"}`,
          }}
        />
      </div>
      <div className="flex items-baseline gap-2.5 pb-2 pl-2.5 pt-1 sm:gap-3 sm:pb-3 sm:pl-3.5">
        <h2 className="text-base font-extrabold tracking-tight text-text-primary sm:text-lg">{row.title}</h2>
        <span className="text-xs font-semibold tabular-nums text-text-secondary sm:text-[13px]">{row.date}</span>
        <span className="h-px flex-1 bg-[var(--border-default)]" />
        <span className="text-[11px] font-semibold tabular-nums text-text-secondary sm:text-xs">{row.count} 場</span>
      </div>
    </div>
  );
}

function NowRow({ row }: { row: Extract<RailRow, { type: "now" }> }) {
  const live = row.liveCount > 0;
  return (
    <div className="relative flex h-10 items-center gap-2 sm:h-[46px] sm:gap-3">
      <span className="absolute left-[60px] top-0 -bottom-3 w-0.5 bg-[var(--rail)] sm:left-[86px]" />
      <span
        className="relative z-10 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-[11px] font-extrabold sm:px-3 sm:text-[12.5px]"
        style={
          live
            ? { background: "var(--bg-accent-pink-muted)", color: "var(--text-primary)", boxShadow: "0 0 0 1px var(--accent-pink)" }
            : { background: "var(--bg-surface-muted)", color: "var(--text-secondary)", boxShadow: "0 0 0 1px var(--border-default)" }
        }
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse" : ""}`}
          style={{ background: live ? "var(--accent-pink)" : "var(--text-secondary)" }}
        />
        <span className="tabular-nums">現在 {row.clock}</span>
      </span>
      <span
        className="relative z-10 truncate text-[11.5px] font-bold sm:text-[13px]"
        style={{ color: live ? "var(--accent-pink-dark)" : "var(--text-secondary)" }}
      >
        {live ? `${row.liveCount} 個頻道正在直播` : "目前沒有人開台"}
      </span>
      <span
        className="h-px flex-1"
        style={{ background: live ? "var(--accent-pink)" : "var(--border-default)", opacity: live ? 0.5 : 1 }}
      />
    </div>
  );
}

function FoldRow({ row, onOpen }: { row: Extract<RailRow, { type: "fold" }>; onOpen: () => void }) {
  const earlier = row.scope === "earlier";
  return (
    <Row
      time={<span className="text-text-secondary">{row.clock}</span>}
      node={
        <>
          <span className={LINE} />
          <span className={`${DOT} !h-2.5 !w-2.5`} style={{ background: "var(--rail)", boxShadow: "0 0 0 3px var(--bg-surface-muted)" }} />
        </>
      }
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface-muted)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-glass)] sm:gap-3 sm:px-3.5"
      >
        <ChevronRight size={15} strokeWidth={2.4} className="flex-none text-text-secondary" aria-hidden />
        <span className="text-xs font-bold text-text-secondary sm:text-[13px]">{earlier ? "更早" : "今天稍早"}</span>
        <span className="text-[11.5px] tabular-nums text-text-secondary sm:text-[12.5px]">{row.count} 場已結束</span>
        <span className="flex-1" />
        <span className="flex items-center" aria-hidden>
          {row.items.slice(0, 4).map((item, index) => (
            <span key={timelineItemKey(item)} style={index > 0 ? { marginLeft: -8 } : undefined}>
              <ChannelAvatar
                src={item.channel.avatar}
                name={item.channel.name}
                size={22}
                className="border-2 border-[var(--bg-surface-muted)]"
              />
            </span>
          ))}
        </span>
      </button>
    </Row>
  );
}

function ItemRow({ row, nowMs }: { row: Extract<RailRow, { type: "item" }>; nowMs: number }) {
  const { item } = row;
  const accent =
    item.kind === "live"
      ? { background: "var(--accent-pink)", boxShadow: "0 0 0 4px var(--bg-accent-pink-muted)" }
      : item.kind === "milestone"
        ? { background: "var(--accent-purple)", boxShadow: "0 0 0 4px var(--bg-accent-pink-muted)" }
        : item.kind === "upcoming"
          ? { background: "var(--accent-blue)", boxShadow: "0 0 0 4px var(--bg-accent-blue-muted)" }
          : { background: "var(--rail)", boxShadow: "0 0 0 3px var(--bg-surface-muted)" };

  return (
    <Row
      time={
        <span className={item.kind === "recent" ? "text-text-secondary" : "text-text-primary"}>
          {row.clock || (item.kind === "milestone" ? "全天" : "待定")}
        </span>
      }
      node={
        <>
          <span className={LINE} />
          <span className={DOT} style={accent} />
        </>
      }
    >
      {item.kind === "milestone" ? (
        <MilestoneCard milestone={item.milestone} channel={item.channel} />
      ) : (
        <StreamCard kind={item.kind} stream={item.stream} channel={item.channel} nowMs={nowMs} />
      )}
    </Row>
  );
}

export default function Timeline({ items, nowMs, mode, onShowFinished }: {
  items: TimelineItem[];
  nowMs: number;
  mode: RailMode;
  onShowFinished: () => void;
}) {
  const rows = useMemo(() => buildRail(items, nowMs, mode), [items, nowMs, mode]);
  const hasContent = rows.some((row) => row.type === "item" || row.type === "fold");

  if (!hasContent) return <EmptyState />;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        switch (row.type) {
          case "day":
            return <DayRow key={row.key} row={row} />;
          case "now":
            return <NowRow key={row.key} row={row} />;
          case "fold":
            return <FoldRow key={row.key} row={row} onOpen={onShowFinished} />;
          case "item":
            return <ItemRow key={row.key} row={row} nowMs={nowMs} />;
          case "tail":
            return (
              <div key={row.key} className={GRID}>
                <div />
                <div className="relative h-8">
                  <span
                    className="absolute left-[8px] top-0 h-5 w-0.5 sm:left-[10px]"
                    style={{ background: "linear-gradient(180deg, var(--rail), transparent)" }}
                  />
                </div>
                <div />
              </div>
            );
        }
      })}
    </div>
  );
}
