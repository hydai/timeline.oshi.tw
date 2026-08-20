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

function validDate(date: string | null): date is string {
  if (date == null || !/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(date)) return false;
  return new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
}

/** Derive the complete milestone history for tracked channels from roster dates. */
export function derivePermanentMilestones(
  vtubers: TwVtuber[],
  trackedYoutubeIds: Set<string>,
  nowIso: string,
): Milestone[] {
  const byKey = new Map<string, Milestone>();
  const throughYear = Number(nowIso.slice(0, 4)) + 1;
  const add = (milestone: Milestone) => {
    byKey.set(`${milestone.channelId}:${milestone.type}:${milestone.date}`, milestone);
  };

  for (const vtuber of vtubers) {
    const channelId = vtuber.youtube_id;
    if (!channelId || !trackedYoutubeIds.has(channelId)) continue;

    if (validDate(vtuber.debut_date)) {
      add({ channelId, type: "debut", date: vtuber.debut_date });
      const debutYear = Number(vtuber.debut_date.slice(0, 4));
      const anniversaryEndYear = validDate(vtuber.graduate_date)
        ? Math.min(throughYear, Number(vtuber.graduate_date.slice(0, 4)))
        : throughYear;
      for (let year = debutYear + 1; year <= anniversaryEndYear; year += 1) {
        const date = `${year}-${vtuber.debut_date.slice(5)}`;
        if (!validDate(date)) continue;
        if (validDate(vtuber.graduate_date) && date > vtuber.graduate_date) continue;
        add({ channelId, type: "anniversary", date });
      }
    }
    if (validDate(vtuber.graduate_date)) {
      add({ channelId, type: "graduate", date: vtuber.graduate_date });
    }
  }

  return [...byKey.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.channelId.localeCompare(right.channelId),
  );
}

export async function fetchRoster(baseUrl: string): Promise<TwVtuber[]> {
  const out: TwVtuber[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const url = `${baseUrl}/v1/vtubers?region=TW&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`twvtuber roster failed (${res.status})`);
    const data = (await res.json()) as ListResponse;
    const page = data.results ?? [];
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}
