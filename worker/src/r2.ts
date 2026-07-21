import type { Snapshot } from "./types";

// NEVER change the prefix away from streams/ — the vod/ prefix belongs to prism.
export const SNAPSHOT_KEY = "streams/v1/snapshot.json";
const CACHE_CONTROL = "public, max-age=300, stale-if-error=86400";

export async function writeSnapshot(bucket: R2Bucket, snapshot: Snapshot): Promise<void> {
  await bucket.put(SNAPSHOT_KEY, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL },
  });
}

export async function readSnapshot(bucket: R2Bucket): Promise<Snapshot | null> {
  const obj = await bucket.get(SNAPSHOT_KEY);
  if (!obj) return null;
  return (await obj.json()) as Snapshot;
}
