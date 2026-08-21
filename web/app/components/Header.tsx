import { Clock } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { formatClock, formatDayHeading, formatRelativeTime, taipeiDayKey } from "@/lib/time";

export default function Header({ updatedAt, nowMs }: { updatedAt: string; nowMs: number }) {
  const iso = new Date(nowMs).toISOString();
  const today = formatDayHeading(taipeiDayKey(iso), nowMs);

  return (
    <header className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-[23px]"
            style={{ backgroundImage: "linear-gradient(135deg, var(--accent-pink), var(--accent-blue))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          timeline.oshi.tw
        </h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          台 V 直播時間軸{updatedAt && ` · 資料更新於 ${formatRelativeTime(updatedAt, nowMs)}`}
        </p>
      </div>
      <div className="flex flex-none items-center gap-2.5">
        {/* The rail is read against the current time, so the page states it outright. */}
        <span className="glass hidden items-center gap-2 rounded-pill px-3.5 py-1.5 text-[13px] font-semibold tabular-nums text-text-secondary sm:inline-flex">
          <Clock size={15} style={{ color: "var(--accent-pink)" }} aria-hidden />
          {today.date} {formatClock(iso)}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
