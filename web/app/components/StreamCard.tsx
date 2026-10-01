"use client";
import { useState } from "react";
import { Users, VideoOff } from "lucide-react";
import type { SnapshotChannel, SnapshotStream } from "@/lib/types";
import { formatClock, formatRelativeTime, taipeiDayKey } from "@/lib/time";
import ChannelAvatar from "./ChannelAvatar";

type Kind = "live" | "upcoming" | "recent";

// Tinted-fill pills with theme-primary text → WCAG AA (>=4.5:1) in both light and dark.
// A solid accent fill with white text would look punchier but only reaches ~2.7:1.
const STATUS: Record<Kind, { label: string; cls: string; style: React.CSSProperties }> = {
  live: { label: "直播中", cls: "text-text-primary", style: { background: "var(--bg-accent-pink-muted)" } },
  upcoming: { label: "預定開台", cls: "text-text-primary", style: { background: "var(--bg-accent-blue-muted)" } },
  recent: { label: "已結束", cls: "text-text-secondary", style: { background: "var(--bg-surface-muted)" } },
};

function timeLabel(kind: Kind, s: SnapshotStream, nowMs: number): string {
  if (kind === "live") return s.actualStart ? `${formatRelativeTime(s.actualStart, nowMs)}開始` : "直播中";
  if (kind === "upcoming") return s.scheduledStart ? formatRelativeTime(s.scheduledStart, nowMs) : "即將開始";
  const end = s.actualEnd ?? s.estimatedEnd;
  return end ? `${s.estimatedEnd ? "約 " : ""}${formatRelativeTime(end, nowMs)}` : "";
}

function Thumbnail({ src, live }: { src: string | null; live: boolean }) {
  const [failed, setFailed] = useState(false);
  // Live streams earn a bigger frame — they are the thing you opened the page for.
  const size = live
    ? "w-[104px] h-[59px] sm:w-[244px] sm:h-[137px]"
    : "w-[104px] h-[59px] sm:w-[176px] sm:h-[99px]";

  return (
    <span
      className={`relative flex-none overflow-hidden rounded-xl bg-[var(--bg-surface-muted)] ${size}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center text-text-tertiary"
          style={{ background: "linear-gradient(135deg, var(--bg-accent-pink), var(--bg-accent-blue))" }}
        >
          <VideoOff size={20} strokeWidth={1.8} aria-hidden />
        </span>
      )}
      {live && (
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill bg-black/80 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent-pink-light)" }} />
          LIVE
        </span>
      )}
    </span>
  );
}

export default function StreamCard({ kind, stream, channel, nowMs }: {
  kind: Kind; stream: SnapshotStream; channel: SnapshotChannel; nowMs: number;
}) {
  const status = STATUS[kind];
  const relative = timeLabel(kind, stream, nowMs);
  const twitch = stream.platform === "twitch";
  const Wrapper = stream.url ? "a" : "article";

  return (
    <Wrapper
      {...(stream.url ? { href: stream.url, target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`glass flex items-center gap-3 rounded-2xl p-2.5 transition-transform hover:-translate-y-0.5 sm:gap-4 sm:p-3.5 ${kind === "recent" ? "opacity-[0.78]" : ""}`}
      style={kind === "live" ? { boxShadow: "0 0 0 1.5px var(--accent-pink), 0 10px 36px rgba(236,72,153,0.18)" } : undefined}
    >
      <Thumbnail src={stream.thumbnail} live={kind === "live"} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2.5">
        <span className="line-clamp-2 text-[12.5px] font-semibold leading-[1.4] text-text-primary sm:text-base sm:leading-[1.46]">
          {stream.title || "直播紀錄"}
        </span>
        {twitch && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-text-secondary sm:text-xs">
            <span className="rounded-pill bg-[var(--bg-surface-muted)] px-2 py-0.5 font-bold">Twitch</span>
            {stream.categoryName && <span>{stream.categoryName}</span>}
            {kind === "recent" && <span>直播紀錄 · 無重播</span>}
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <ChannelAvatar src={channel.avatar} name={channel.name} size={20} />
          <span className="truncate text-[11px] font-bold text-text-secondary sm:text-[13px]">{channel.name}</span>
          {channel.group && (
            <span className="hidden flex-none rounded-pill bg-[var(--bg-surface-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary sm:inline">
              {channel.group}
            </span>
          )}
          {/* Rendered once, next to the channel: a second copy in the meta column would
              be read out twice by a screen reader. */}
          <span className="flex-none text-[10.5px] font-semibold tabular-nums text-text-secondary sm:text-xs">
            {relative}
          </span>
        </span>
        {twitch && kind === "recent" && stream.actualStart && (
          <span className="text-[10.5px] text-text-secondary sm:text-xs">
            開台 {taipeiDayKey(stream.actualStart)} {formatClock(stream.actualStart)}（台北）
          </span>
        )}
        {twitch && kind === "recent" && !stream.url && stream.channelUrl && (
          <a href={stream.channelUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-[11px] text-text-secondary underline underline-offset-2 sm:text-xs">
            前往 Twitch 頻道
          </a>
        )}
      </div>

      <div className="hidden w-[104px] flex-none flex-col items-end gap-1.5 sm:flex">
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-extrabold ${status.cls}`}
          style={status.style}
        >
          {kind === "live" && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--accent-pink)" }} />
          )}
          {status.label}
        </span>
        {kind === "live" && stream.concurrentViewers != null && (
          <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-text-secondary">
            <Users size={12} /> {stream.concurrentViewers.toLocaleString()}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
