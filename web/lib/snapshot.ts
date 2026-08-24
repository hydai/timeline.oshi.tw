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
  let facetsComplete = raw.facets === "channel";
  const months: ArchiveIndex["months"] = [];
  for (const month of Array.isArray(raw.months) ? raw.months : []) {
    if (
      month == null ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month) ||
      !Number.isInteger(month.streams) || month.streams < 0 ||
      !Number.isInteger(month.milestones) || month.milestones < 0
    ) continue;

    const byChannel: NonNullable<(typeof month)["by_channel"]> = {};
    let channelStreams = 0;
    let channelMilestones = 0;
    if (raw.facets === "channel") {
      if (!month.by_channel || typeof month.by_channel !== "object" || Array.isArray(month.by_channel)) {
        facetsComplete = false;
      } else {
        for (const [channelId, counts] of Object.entries(month.by_channel)) {
          if (
            !channelId || counts == null ||
            !Number.isInteger(counts.streams) || counts.streams < 0 ||
            !Number.isInteger(counts.milestones) || counts.milestones < 0
          ) {
            facetsComplete = false;
            continue;
          }
          byChannel[channelId] = { streams: counts.streams, milestones: counts.milestones };
          channelStreams += counts.streams;
          channelMilestones += counts.milestones;
        }
        if (channelStreams !== month.streams || channelMilestones !== month.milestones) {
          facetsComplete = false;
        }
      }
    }
    months.push({
      month: month.month,
      streams: month.streams,
      milestones: month.milestones,
      ...(raw.facets === "channel" ? { by_channel: byChannel } : {}),
    });
  }
  return {
    version: (raw.version ?? "1.0.0") as "1.0.0",
    generated_at: raw.generated_at ?? "",
    ...(facetsComplete ? { facets: "channel" as const } : {}),
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
