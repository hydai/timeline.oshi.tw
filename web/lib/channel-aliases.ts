import registry from "@/data/channel-aliases.json";

export interface ChannelProfile {
  slug: string;
  aliases: string[];
  name: string;
  avatar: string | null;
}

export function indexChannelAliases(profiles: Record<string, ChannelProfile>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [channelId, profile] of Object.entries(profiles)) {
    if (!/^UC[\w-]{22}$/.test(channelId)) throw new Error(`Invalid channel ID: ${channelId}`);
    for (const slug of [profile.slug, ...profile.aliases]) {
      if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(slug)) throw new Error(`Invalid channel alias: ${slug}`);
      if (index.has(slug)) throw new Error(`Duplicate channel alias: ${slug}`);
      index.set(slug, channelId);
    }
  }
  return index;
}

// This registry ships with the static pages: only deployed aliases become share links.
export const channelProfiles: Record<string, ChannelProfile> = Object.assign(Object.create(null), registry);
export const channelAliases = indexChannelAliases(channelProfiles);

export function channelPath(channelId: string): string | null {
  const profile = channelProfiles[channelId];
  return profile ? `/v/${encodeURIComponent(profile.slug)}` : null;
}

export function channelIdFromSlug(slug: string): string | null {
  try {
    return channelAliases.get(decodeURIComponent(slug)) ?? null;
  } catch {
    return null;
  }
}

export function channelIdFromPath(pathname: string): string | null {
  const match = /^\/v\/([^/]+)\/?$/.exec(pathname);
  return match ? channelIdFromSlug(match[1]!) : null;
}
