import type { ArchiveIndex, ArchiveMonth, Snapshot } from "./types";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`snapshot fetch failed (${res.status})`);
  return res.json();
}

/** Fetch the published snapshot. Fills missing arrays so the UI never crashes. */
export async function fetchSnapshot(url: string): Promise<Snapshot> {
  const raw = (await fetchJson(url)) as Partial<Snapshot>;
  return {
    version: (raw.version ?? "1.0.0") as "1.0.0",
    generated_at: raw.generated_at ?? "",
    heavy_refreshed_at: raw.heavy_refreshed_at ?? "",
    channels: raw.channels ?? {},
    groups: raw.groups ?? [],
    live: raw.live ?? [],
    upcoming: raw.upcoming ?? [],
    recent: raw.recent ?? [],
    milestones: raw.milestones ?? [],
  };
}

export function archiveIndexUrl(snapshotUrl: string): string {
  const clean = snapshotUrl.split(/[?#]/, 1)[0] ?? snapshotUrl;
  return `${clean.slice(0, clean.lastIndexOf("/") + 1)}archive/index.json`;
}

export function archiveMonthUrl(indexUrl: string, month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`invalid archive month: ${month}`);
  const clean = indexUrl.split(/[?#]/, 1)[0] ?? indexUrl;
  return `${clean.slice(0, clean.lastIndexOf("/") + 1)}${month}.json`;
}

export async function fetchArchiveIndex(url: string): Promise<ArchiveIndex> {
  const raw = (await fetchJson(url)) as Partial<ArchiveIndex>;
  const months = Array.isArray(raw.months)
    ? raw.months.filter((month) =>
      month != null &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month.month) &&
      Number.isInteger(month.streams) && month.streams >= 0 &&
      Number.isInteger(month.milestones) && month.milestones >= 0,
    )
    : [];
  return {
    version: (raw.version ?? "1.0.0") as "1.0.0",
    generated_at: raw.generated_at ?? "",
    months: months.sort((left, right) => right.month.localeCompare(left.month)),
  };
}

export async function fetchArchiveMonth(url: string): Promise<ArchiveMonth> {
  const raw = (await fetchJson(url)) as Partial<ArchiveMonth>;
  if (!raw.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) {
    throw new Error("invalid archive month payload");
  }
  return {
    version: (raw.version ?? "1.0.0") as "1.0.0",
    generated_at: raw.generated_at ?? "",
    month: raw.month,
    channels: raw.channels && typeof raw.channels === "object" ? raw.channels : {},
    streams: Array.isArray(raw.streams) ? raw.streams : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
  };
}
