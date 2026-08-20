import type { ArchiveIndex, ArchiveMonth, Snapshot } from "./types";

// NEVER change the prefix away from streams/ — the vod/ prefix belongs to prism.
export const SNAPSHOT_KEY = "streams/v1/snapshot.json";
export const ARCHIVE_INDEX_KEY = "streams/v1/archive/index.json";
const CACHE_CONTROL = "public, max-age=300, stale-if-error=86400";

export function archiveMonthKey(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`invalid archive month: ${month}`);
  return `streams/v1/archive/${month}.json`;
}

async function writeJson(bucket: R2Bucket, key: string, value: unknown): Promise<void> {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL },
  });
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return (await obj.json()) as T;
}

export async function writeSnapshot(bucket: R2Bucket, snapshot: Snapshot): Promise<void> {
  await writeJson(bucket, SNAPSHOT_KEY, snapshot);
}

export async function readSnapshot(bucket: R2Bucket): Promise<Snapshot | null> {
  return readJson<Snapshot>(bucket, SNAPSHOT_KEY);
}

export async function writeArchiveIndex(bucket: R2Bucket, index: ArchiveIndex): Promise<void> {
  await writeJson(bucket, ARCHIVE_INDEX_KEY, index);
}

export async function readArchiveIndex(bucket: R2Bucket): Promise<ArchiveIndex | null> {
  return readJson<ArchiveIndex>(bucket, ARCHIVE_INDEX_KEY);
}

export async function writeArchiveMonth(bucket: R2Bucket, archive: ArchiveMonth): Promise<void> {
  await writeJson(bucket, archiveMonthKey(archive.month), archive);
}
