import { backfillChannel, type BackfillDeps, type BackfillReport } from "./backfill";
import type { PrismStreamer } from "./prism";
import type { Env } from "./types";

const CHANNEL_ID = /^UC[\w-]{22}$/;
const EXCLUDED_GROUP = /hololive/i;
// Preserve the original seed policy even if data's affiliation is temporarily edited.
const EXCLUDED_CHANNEL_IDS = new Set(["UC1opHUrw8rvnsadT-iGp7Cg"]); // Minato Aqua
const BATCH_CHANNELS = 50;
const RUNNING_LEASE_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 1_000;

export interface OnboardingCandidate {
  channelId: string;
  handle: string | null;
}

export type BackfillStatus = "legacy" | "pending" | "running" | "complete" | "failed" | "truncated";

export interface OnboardingRow {
  channel_id: string;
  source: string;
  backfill_status: BackfillStatus;
  discovered_at: string;
  backfill_attempts: number;
  last_backfill_at: string | null;
  backfilled_at: string | null;
  last_error: string | null;
}

export interface OnboardingResult {
  channelId: string;
  status: "complete" | "failed" | "truncated";
  report?: BackfillReport;
  error?: string;
}

/**
 * Data's VOD directory is the tracking authority, except for hololive. Hololive
 * appears there for collaboration/VOD attribution but is intentionally outside
 * timeline's Taiwan-VTuber channel set.
 */
export function timelineOnboardingCandidates(streamers: PrismStreamer[]): OnboardingCandidate[] {
  const candidates = new Map<string, OnboardingCandidate>();
  for (const streamer of streamers) {
    if (!CHANNEL_ID.test(streamer.youtubeChannelId)) continue;
    if (EXCLUDED_CHANNEL_IDS.has(streamer.youtubeChannelId)) continue;
    if (EXCLUDED_GROUP.test(streamer.group)) continue;
    candidates.set(streamer.youtubeChannelId, {
      channelId: streamer.youtubeChannelId,
      handle: streamer.handle,
    });
  }
  return [...candidates.values()].sort((a, b) => a.channelId.localeCompare(b.channelId));
}

/**
 * Add every eligible data channel and its pending job in one D1 transaction per
 * chunk. Existing onboarding rows win, so completed/legacy channels never reset.
 */
export async function registerOnboardingCandidates(
  db: D1Database,
  candidates: OnboardingCandidate[],
  nowIso: string,
): Promise<string[]> {
  const registered: string[] = [];
  for (let i = 0; i < candidates.length; i += BATCH_CHANNELS) {
    const chunk = candidates.slice(i, i + BATCH_CHANNELS);
    const statements: D1PreparedStatement[] = [];
    for (const candidate of chunk) {
      statements.push(
        db.prepare(
          `INSERT INTO channels (channel_id, handle, enabled, added_at)
           VALUES (?1, ?2, 1, ?3)
           ON CONFLICT(channel_id) DO UPDATE SET
             handle = COALESCE(channels.handle, excluded.handle)`,
        ).bind(candidate.channelId, candidate.handle, nowIso),
        db.prepare(
          `INSERT INTO channel_onboarding
             (channel_id, source, backfill_status, discovered_at)
           SELECT ?1, 'data-vod', 'pending', ?2
           WHERE EXISTS (SELECT 1 FROM channels WHERE channel_id = ?1)
           ON CONFLICT(channel_id) DO NOTHING`,
        ).bind(candidate.channelId, nowIso),
      );
    }
    const results = await db.batch(statements);
    for (let n = 0; n < chunk.length; n += 1) {
      if ((results[n * 2 + 1]?.meta.changes ?? 0) > 0) registered.push(chunk[n]!.channelId);
    }
  }
  return registered;
}

async function claimNextOnboarding(db: D1Database, nowIso: string): Promise<string | null> {
  const staleBefore = new Date(new Date(nowIso).getTime() - RUNNING_LEASE_MS).toISOString();
  const row = await db.prepare(
    `SELECT channel_id FROM channel_onboarding
     WHERE backfill_status IN ('pending', 'failed')
        OR (backfill_status = 'running' AND last_backfill_at < ?1)
     ORDER BY discovered_at, channel_id
     LIMIT 1`,
  ).bind(staleBefore).first<{ channel_id: string }>();
  if (!row) return null;

  const claimed = await db.prepare(
    `UPDATE channel_onboarding
     SET backfill_status = 'running',
         backfill_attempts = backfill_attempts + 1,
         last_backfill_at = ?2,
         last_error = NULL
     WHERE channel_id = ?1
       AND (backfill_status IN ('pending', 'failed')
         OR (backfill_status = 'running' AND last_backfill_at < ?3))`,
  ).bind(row.channel_id, nowIso, staleBefore).run();

  return claimed.meta.changes === 1 ? row.channel_id : null;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
}

async function settleOnboarding(
  db: D1Database,
  channelId: string,
  status: "complete" | "failed" | "truncated",
  nowIso: string,
  error: string | null,
): Promise<void> {
  await db.prepare(
    `UPDATE channel_onboarding
     SET backfill_status = ?2,
         backfilled_at = CASE WHEN ?2 = 'complete' THEN ?3 ELSE NULL END,
         last_error = ?4
     WHERE channel_id = ?1`,
  ).bind(channelId, status, nowIso, error).run();
}

/** Keep a curator-triggered write from being repeated by automatic onboarding. */
export async function settleManualBackfill(
  db: D1Database,
  report: BackfillReport,
  nowIso: string,
): Promise<void> {
  const status = report.truncated ? "truncated" : "complete";
  const error = report.truncated ? "uploads playlist exceeded the 10,000-video automatic limit" : null;
  await settleOnboarding(db, report.channelId, status, nowIso, error);
}

/**
 * Process at most one full-history job per heavy refresh. This bounds a cron
 * invocation while durable status makes failures retryable and duplicate crons safe.
 */
export async function processNextOnboarding(
  env: Env,
  deps: BackfillDeps,
  nowIso: string,
): Promise<OnboardingResult | null> {
  const channelId = await claimNextOnboarding(env.DB, nowIso);
  if (!channelId) return null;

  try {
    const report = await backfillChannel(env, { ...deps, now: () => nowIso }, channelId, { dryRun: false });
    const status = report.truncated ? "truncated" : "complete";
    const error = report.truncated ? "uploads playlist exceeded the 10,000-video automatic limit" : null;
    await settleOnboarding(env.DB, channelId, status, nowIso, error);
    console.log(JSON.stringify({ message: "channel onboarding backfill finished", status, ...report }));
    return { channelId, status, report };
  } catch (error) {
    const message = errorMessage(error);
    await settleOnboarding(env.DB, channelId, "failed", nowIso, message);
    console.error(JSON.stringify({ message: "channel onboarding backfill failed", channelId, error: message }));
    return { channelId, status: "failed", error: message };
  }
}
