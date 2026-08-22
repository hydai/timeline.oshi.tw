import { upsertStreamsBatch } from "./db";
import { uploadsPlaylistId } from "./youtube";
import type { Env, StreamRecord } from "./types";

export interface BackfillDeps {
  fetchUploadIds: (playlistId: string) => Promise<string[]>;
  fetchVideoDetails: (ids: string[]) => Promise<StreamRecord[]>;
  now: () => string;
}

export interface BackfillReport {
  channelId: string;
  /** Everything in the uploads playlist, streams and ordinary videos alike. */
  uploads: number;
  /** Uploads that were actually broadcast — premieres count, having gone out live too. */
  livestreams: number;
  oldest: string | null;
  newest: string | null;
  inserted: number;
  quotaUnits: number;
  dryRun: boolean;
}

const PAGE = 50;
const units = (count: number) => Math.ceil(count / PAGE);

/**
 * Pull one channel's whole upload history and report what it would add.
 *
 * Routine discovery reads the channel RSS feed, which only carries the latest ~15
 * videos — that is why stream history begins where scanning began. This walks the
 * uploads playlist instead, which reaches back to the channel's first upload.
 *
 * Only VODs that still exist can be recovered: a stream deleted, made private or put
 * behind membership after it ended is simply absent from the playlist, and there is no
 * API that brings it back.
 */
export async function backfillChannel(
  env: Env,
  deps: BackfillDeps,
  channelId: string,
  options: { dryRun: boolean },
): Promise<BackfillReport> {
  const uploadIds = await deps.fetchUploadIds(uploadsPlaylistId(channelId));
  const details = uploadIds.length > 0 ? await deps.fetchVideoDetails(uploadIds) : [];

  // actualStart is what separates a broadcast from an ordinary upload.
  const streams = details.filter((record) => record.actualStart != null);
  const startedAt = streams.map((record) => record.actualStart!).sort();

  if (!options.dryRun && streams.length > 0) {
    await upsertStreamsBatch(env.DB, streams, deps.now());
  }

  return {
    channelId,
    uploads: uploadIds.length,
    livestreams: streams.length,
    oldest: startedAt[0] ?? null,
    newest: startedAt[startedAt.length - 1] ?? null,
    inserted: options.dryRun ? 0 : streams.length,
    quotaUnits: units(uploadIds.length) + units(uploadIds.length),
    dryRun: options.dryRun,
  };
}
