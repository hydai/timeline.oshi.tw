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

/** "個人勢" is the absence of a company, not the name of one. */
const UNAFFILIATED = "個人勢";

interface PrismManifest { sha256?: unknown }
interface PrismStreamer { youtubeChannelId?: unknown; group?: unknown }
interface PrismSnapshot { streamers?: unknown }

/**
 * Fold presentation-only codepoints so two spellings of one company compare equal.
 * Prism ships 𝖶𝖤𝖱𝖧𝖠𝖴𝖲 𝖬𝖴𝖲𝖨𝖢 in mathematical-bold letters, which break search,
 * sorting and screen readers, and which many fonts cannot render at all.
 */
export function normalizeGroupName(raw: string): string {
  return raw.normalize("NFKC").trim();
}

/** Overlay prism's company names onto a twvtuber roster, without ever losing one. */
export function applyPrismGroups(
  roster: Map<string, RosterEntry>,
  prismGroups: Map<string, string>,
): Map<string, RosterEntry> {
  const merged = new Map(roster);

  for (const [youtubeId, entry] of roster) {
    const raw = prismGroups.get(youtubeId);
    if (!raw) continue;

    const override = normalizeGroupName(raw);
    // Prism saying "個人勢" means it has no affiliation on file, which is not grounds
    // for deleting one we do have — 銀河 Galaxy would lose 靛堂.
    if (!override || override === UNAFFILIATED) continue;

    // Same company, differently spelled: keep the name we already display, which is
    // the better-cased of the two.
    if (entry.group && normalizeGroupName(entry.group).toLowerCase() === override.toLowerCase()) {
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
export async function readPrismGroups(bucket: R2Bucket): Promise<Map<string, string>> {
  const groups = new Map<string, string>();

  const manifestObject = await bucket.get(PRISM_MANIFEST_KEY);
  if (!manifestObject) return groups;

  let key: string;
  try {
    const manifest = (await manifestObject.json()) as PrismManifest;
    if (typeof manifest.sha256 !== "string") return groups;
    key = prismSnapshotKey(manifest.sha256);
  } catch {
    return groups;
  }

  const snapshotObject = await bucket.get(key);
  if (!snapshotObject) return groups;

  let streamers: unknown;
  try {
    ({ streamers } = (await snapshotObject.json()) as PrismSnapshot);
  } catch {
    return groups;
  }
  if (!Array.isArray(streamers)) return groups;

  for (const streamer of streamers as PrismStreamer[]) {
    const { youtubeChannelId, group } = streamer;
    if (typeof youtubeChannelId !== "string" || typeof group !== "string") continue;
    const name = normalizeGroupName(group);
    if (!name || name === UNAFFILIATED) continue;
    groups.set(youtubeChannelId, name);
  }

  return groups;
}
