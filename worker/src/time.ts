/** Taipei is UTC+8 with no daylight saving, ever, so the whole conversion is one shift. */
export const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * The Taipei calendar month (`YYYY-MM`) an instant falls in. Archive month files are
 * grouped this way — see TAIPEI_MONTH_SQL in db.ts, which must agree with this.
 */
export function taipeiMonth(iso: string): string {
  return new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 7);
}
