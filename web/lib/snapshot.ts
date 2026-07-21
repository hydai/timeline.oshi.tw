import type { Snapshot } from "./types";

/** Fetch the published snapshot. Fills missing arrays so the UI never crashes. */
export async function fetchSnapshot(url: string): Promise<Snapshot> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`snapshot fetch failed (${res.status})`);
  const raw = (await res.json()) as Partial<Snapshot>;
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
