import { parseYoutubeLink } from "./seed";
import type { RosterEntry } from "./types";

/**
 * Company names for tracked channels, taken from prism's VOD export.
 *
 * twvtuber and prism disagree on how to name the same company — twvtuber files the
 * 春魚創意 channels under their brand "SquareLive". prism is the authority we want for
 * that, so it wins where it has an affiliation on file.
 *
 * We only ever READ the vod/ prefix; it belongs to prism, and r2.ts keeps our writes
 * on streams/.
 */
export const PRISM_MANIFEST_KEY = "vod/v1/manifest.json";

/** Prism publishes content-addressed snapshots, with the manifest naming the current one. */
export function prismSnapshotKey(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`invalid prism snapshot digest: ${sha256}`);
  return `vod/v1/snapshots/${sha256}.json`;
}

/**
 * Prism states a group for every streamer it carries — there are no nulls or gaps —
 * so "個人勢" is an assertion that the channel is unaffiliated, not missing data. We
 * represent that as null, which the site renders as 個人勢.
 */
const UNAFFILIATED = "個人勢";

interface PrismManifest { sha256?: unknown }
interface RawPrismStreamer {
  youtubeChannelId?: unknown;
  group?: unknown;
  socialLinks?: { youtube?: unknown };
}
interface PrismSnapshot { streamers?: unknown }

export interface PrismStreamer {
  youtubeChannelId: string;
  handle: string | null;
  /** Normalized source value. `個人勢` remains explicit here for onboarding policy. */
  group: string;
}

/**
 * Fold presentation-only codepoints so two spellings of one company compare equal.
 * Prism ships 𝖶𝖤𝖱𝖧𝖠𝖴𝖲 𝖬𝖴𝖲𝖨𝖢 in mathematical-bold letters, which break search,
 * sorting and screen readers, and which many fonts cannot render at all.
 */
export function normalizeGroupName(raw: string): string {
  return raw.normalize("NFKC").trim();
}

/** Convert one already-read VOD directory into the affiliation overlay. */
export function indexPrismGroups(streamers: PrismStreamer[]): Map<string, string | null> {
  const groups = new Map<string, string | null>();
  for (const streamer of streamers) {
    groups.set(streamer.youtubeChannelId, streamer.group === UNAFFILIATED ? null : streamer.group);
  }
  return groups;
}

/**
 * Overlay prism's affiliations onto a twvtuber roster. Prism wins for every channel it
 * carries, including clearing one twvtuber has stale — 銀河 Galaxy went solo while
 * twvtuber still filed it under 靛堂. Channels prism does not carry are left alone.
 */
export function applyPrismGroups(
  roster: Map<string, RosterEntry>,
  prismGroups: Map<string, string | null>,
): Map<string, RosterEntry> {
  const merged = new Map(roster);

  for (const [youtubeId, entry] of roster) {
    if (!prismGroups.has(youtubeId)) continue;
    const raw = prismGroups.get(youtubeId) ?? null;
    const override = raw === null ? null : normalizeGroupName(raw) || null;

    // Same company, differently spelled: keep the name we already display, which is
    // the better-cased of the two.
    if (override && entry.group
        && normalizeGroupName(entry.group).toLowerCase() === override.toLowerCase()) {
      continue;
    }
    merged.set(youtubeId, { ...entry, group: override });
  }

  return merged;
}

/**
 * Read prism's company names. Any gap — no manifest, a digest pointing at a snapshot
 * that has been pruned, malformed JSON — yields an empty map, so a prism outage leaves
 * the twvtuber groups standing rather than blanking them.
 */
export async function readPrismStreamers(bucket: R2Bucket): Promise<PrismStreamer[]> {
  const manifestObject = await bucket.get(PRISM_MANIFEST_KEY);
  if (!manifestObject) return [];

  let key: string;
  try {
    const manifest = (await manifestObject.json()) as PrismManifest;
    if (typeof manifest.sha256 !== "string") return [];
    key = prismSnapshotKey(manifest.sha256);
  } catch {
    return [];
  }

  const snapshotObject = await bucket.get(key);
  if (!snapshotObject) return [];

  let streamers: unknown;
  try {
    ({ streamers } = (await snapshotObject.json()) as PrismSnapshot);
  } catch {
    return [];
  }
  if (!Array.isArray(streamers)) return [];

  const out: PrismStreamer[] = [];
  for (const raw of streamers) {
    if (raw == null || typeof raw !== "object") continue;
    const streamer = raw as RawPrismStreamer;
    const { youtubeChannelId, group } = streamer;
    if (typeof youtubeChannelId !== "string" || typeof group !== "string") continue;
    const name = normalizeGroupName(group);
    if (!name) continue;
    const youtube = streamer.socialLinks?.youtube;
    const handle = typeof youtube === "string" ? parseYoutubeLink(youtube).handle ?? null : null;
    out.push({ youtubeChannelId, handle, group: name });
  }

  return out;
}

/** Backwards-compatible convenience for callers that only need company names. */
export async function readPrismGroups(bucket: R2Bucket): Promise<Map<string, string | null>> {
  return indexPrismGroups(await readPrismStreamers(bucket));
}
