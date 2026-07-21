import type { SnapshotChannel, SnapshotStream } from "@/lib/types";
import { formatRelativeTime } from "@/lib/time";
import { Users } from "lucide-react";

type Kind = "live" | "upcoming" | "recent";

const STATUS: Record<Kind, { label: string; cls: string; style: React.CSSProperties }> = {
  live: { label: "直播中", cls: "text-white", style: { background: "linear-gradient(135deg, var(--accent-pink), var(--accent-pink-dark))" } },
  upcoming: { label: "預定開台", cls: "text-accent-blue", style: { background: "var(--bg-accent-blue-muted)" } },
  recent: { label: "已結束", cls: "text-text-secondary", style: { background: "var(--bg-surface-muted)" } },
};

function timeLabel(kind: Kind, s: SnapshotStream, nowMs: number): string {
  if (kind === "live") return s.actualStart ? `${formatRelativeTime(s.actualStart, nowMs)}開始` : "直播中";
  if (kind === "upcoming") return s.scheduledStart ? formatRelativeTime(s.scheduledStart, nowMs) : "即將開始";
  return s.actualEnd ? formatRelativeTime(s.actualEnd, nowMs) : "";
}

export default function StreamCard({ kind, stream, channel, nowMs }: {
  kind: Kind; stream: SnapshotStream; channel: SnapshotChannel; nowMs: number;
}) {
  const s = STATUS[kind];
  return (
    <a href={stream.url} target="_blank" rel="noopener noreferrer"
       className="glass block rounded-2xl p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center gap-3">
        {channel.avatar ? (
          <img src={channel.avatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-full" style={{ background: "linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-text-primary">{channel.name}</div>
          {channel.group && <div className="truncate text-xs text-text-tertiary">{channel.group}</div>}
        </div>
        <span className={`flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-medium ${s.cls}`} style={s.style}>
          {kind === "live" && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />}
          {s.label}
        </span>
      </div>
      <div className="mt-3 line-clamp-2 text-sm text-text-primary">{stream.title}</div>
      {stream.thumbnail && (
        <img src={stream.thumbnail} alt="" loading="lazy" className="mt-3 aspect-video w-full rounded-xl object-cover" />
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
        <span>{timeLabel(kind, stream, nowMs)}</span>
        {kind === "live" && stream.concurrentViewers != null && (
          <span className="flex items-center gap-1"><Users size={12} /> {stream.concurrentViewers.toLocaleString()}</span>
        )}
      </div>
    </a>
  );
}
