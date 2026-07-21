const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Traditional-Chinese relative time. `nowMs` is injected for determinism. */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - nowMs;
  const suffix = diff >= 0 ? "後" : "前";
  const abs = Math.abs(diff);
  if (abs < MIN) return "剛剛";
  if (abs < HOUR) return `${Math.floor(abs / MIN)} 分鐘${suffix}`;
  if (abs < DAY) return `${Math.floor(abs / HOUR)} 小時${suffix}`;
  return `${Math.floor(abs / DAY)} 天${suffix}`;
}
