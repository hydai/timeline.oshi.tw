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
const TAIPEI = "Asia/Taipei";

// en-CA renders ISO-shaped YYYY-MM-DD; h23 keeps midnight at 00:00 rather than 24:00.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TAIPEI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TAIPEI,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

/** Calendar day in Taipei (`YYYY-MM-DD`), so day grouping never depends on the viewer's clock. */
export function taipeiDayKey(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return dayFormatter.format(t);
}

/** Taipei wall-clock time as `HH:MM`. */
export function formatClock(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return clockFormatter.format(t);
}

/** Shift a `YYYY-MM-DD` key by whole days, staying in the Taipei calendar. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "";
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Day-divider text: relative for today/tomorrow, otherwise the date with the weekday beneath. */
export function formatDayHeading(dayKey: string, nowMs: number): { title: string; date: string } {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return { title: "", date: "" };
  // Anchor at UTC noon so the weekday can never slip across a timezone boundary.
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()] ?? "";
  const today = taipeiDayKey(new Date(nowMs).toISOString());
  // Carry the year once it differs from today's: a bare "6/9" on a 2027 entry reads
  // as a date that has already gone by, which is the opposite of the truth.
  const sameYear = dayKey.slice(0, 4) === today.slice(0, 4);
  const monthDay = sameYear ? `${m}/${d}` : `${y}/${m}/${d}`;

  if (dayKey === today) return { title: "今天", date: `${monthDay} ${weekday}` };
  if (dayKey === shiftDayKey(today, 1)) return { title: "明天", date: `${monthDay} ${weekday}` };
  return { title: monthDay, date: weekday };
}
