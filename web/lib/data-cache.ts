export interface CachePolicy {
  freshFor: number;
  maxAge: number;
  priority?: number;
}

export interface CacheOptions<T> {
  onCached?: (data: T) => void;
  force?: boolean;
}

const PREFIX = "timeline:data:v1:";
const MAX_ENTRIES = 8;
const MAX_CHARACTERS = 2_000_000;
const inFlight = new Map<string, Promise<unknown>>();

interface StoredData {
  savedAt: number;
  expiresAt: number;
  priority?: number;
  data: unknown;
}

function cacheKey(url: string): string {
  return PREFIX + (typeof window === "undefined" ? url : new URL(url, window.location.href).href);
}

function readCache<T>(key: string, decode: (raw: unknown) => T, policy: CachePolicy) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const entry = JSON.parse(stored) as StoredData;
    const age = Date.now() - entry.savedAt;
    if (!Number.isFinite(age) || age < 0 || age >= policy.maxAge || !entry.data) {
      localStorage.removeItem(key);
      return null;
    }
    return { data: decode(entry.data), age };
  } catch {
    // Disabled storage and a damaged entry must never prevent a network load.
    return null;
  }
}

function writeCache(key: string, data: unknown, { maxAge, priority = 0 }: CachePolicy) {
  try {
    const savedAt = Date.now();
    const serialized = JSON.stringify({ savedAt, expiresAt: savedAt + maxAge, priority, data });
    if (serialized.length > MAX_CHARACTERS) return;
    const entries: { key: string; savedAt: number; priority: number; size: number }[] = [];
    // Bound both count and size; never evict another feature's storage (e.g. theme).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storedKey = localStorage.key(i)!;
      if (!storedKey.startsWith(PREFIX) || storedKey === key) continue;
      const value = localStorage.getItem(storedKey)!;
      try {
        const entry = JSON.parse(value) as StoredData;
        if (!Number.isFinite(entry.savedAt) || !(entry.expiresAt > savedAt)) {
          localStorage.removeItem(storedKey);
        } else {
          entries.push({ key: storedKey, savedAt: entry.savedAt, priority: entry.priority ?? 0, size: value.length });
        }
      } catch {
        localStorage.removeItem(storedKey);
      }
    }
    // Browsing several archive months must not evict the snapshot/index needed to
    // restore the page on reload. Prefer evicting older, lower-priority entries.
    entries.sort((left, right) => left.priority - right.priority || left.savedAt - right.savedAt);
    let size = entries.reduce((total, entry) => total + entry.size, serialized.length);
    while (entries.length >= MAX_ENTRIES || size > MAX_CHARACTERS) {
      const oldest = entries.shift()!;
      if (oldest.priority > priority) return;
      localStorage.removeItem(oldest.key);
      size -= oldest.size;
    }
    // The browser's quota may be smaller than our budget. Retry after evicting only
    // our oldest entries; caching remains optional if storage cannot accept a write.
    for (;;) {
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch {
        const oldest = entries.shift();
        if (!oldest || oldest.priority > priority) return;
        localStorage.removeItem(oldest.key);
      }
    }
  } catch {
    // Private browsing or a full quota must not turn a successful fetch into an error.
  }
}

/** Deliver persisted data immediately, then revalidate it once its freshness expires. */
export async function fetchCachedJson<T>(
  url: string,
  decode: (raw: unknown) => T,
  policy: CachePolicy,
  { onCached, force = false }: CacheOptions<T> = {},
): Promise<T> {
  const key = cacheKey(url);
  const cached = readCache(key, decode, policy);
  if (cached) {
    onCached?.(cached.data);
    if (!force && cached.age < policy.freshFor) return cached.data;
  }

  let request = inFlight.get(key) as Promise<T> | undefined;
  if (!request) {
    request = (async () => {
      // Unlike no-store, no-cache lets the browser store responses and revalidate
      // them with the origin's ETag. Application TTLs decide when to make this check.
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`snapshot fetch failed (${response.status})`);
      const data = decode(await response.json());
      writeCache(key, data, policy);
      return data;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}
