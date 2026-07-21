import type { Milestone, RosterEntry } from "./types";

export interface TwVtuber {
  id: string;
  name: string;
  youtube_id: string | null;
  group_name: string | null;
  nationality: string | null;
  youtube_subs: number | null;
  img_url: string | null;
  debut_date: string | null;
  graduate_date: string | null;
}

interface ListResponse { results?: TwVtuber[] }

export function indexRosterByYoutubeId(vtubers: TwVtuber[]): Map<string, RosterEntry> {
  const map = new Map<string, RosterEntry>();
  for (const v of vtubers) {
    if (!v.youtube_id) continue;
    map.set(v.youtube_id, {
      youtubeId: v.youtube_id,
      name: v.name,
      group: v.group_name,
      nationality: v.nationality,
      youtubeSubs: v.youtube_subs,
      avatar: v.img_url,
      twvtuberId: v.id,
    });
  }
  return map;
}

/** Pure: derive a milestone's display date. Returns null if the source date is missing. */
export function toMilestone(v: TwVtuber, type: Milestone["type"], nowIso: string): Milestone | null {
  if (!v.youtube_id) return null;
  let date: string | null = null;
  if (type === "graduate") {
    date = v.graduate_date;
  } else if (type === "debut") {
    date = v.debut_date;
  } else {
    // anniversary: this-year occurrence of the debut month-day
    if (v.debut_date) date = `${nowIso.slice(0, 4)}-${v.debut_date.slice(5)}`;
  }
  return date ? { channelId: v.youtube_id, type, date } : null;
}

export async function fetchRoster(baseUrl: string): Promise<TwVtuber[]> {
  const out: TwVtuber[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const url = `${baseUrl}/v1/vtubers?region=TW&activity=active&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`twvtuber roster failed (${res.status})`);
    const data = (await res.json()) as ListResponse;
    const page = data.results ?? [];
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

export async function fetchMilestones(
  baseUrl: string,
  trackedYoutubeIds: Set<string>,
  nowIso: string,
): Promise<Milestone[]> {
  const specs: Array<{ type: Milestone["type"]; qs: string }> = [
    { type: "debut", qs: "type=debut&window=upcoming" },
    { type: "anniversary", qs: "type=anniversary&window=recent" },
    { type: "graduate", qs: "type=graduate" },
  ];
  const out: Milestone[] = [];
  for (const s of specs) {
    const res = await fetch(`${baseUrl}/v1/events?${s.qs}&region=TW`);
    if (!res.ok) continue; // tolerate partial failure (design §10)
    const data = (await res.json()) as ListResponse;
    for (const v of data.results ?? []) {
      if (!v.youtube_id || !trackedYoutubeIds.has(v.youtube_id)) continue;
      const m = toMilestone(v, s.type, nowIso);
      if (m) out.push(m);
    }
  }
  return out;
}
