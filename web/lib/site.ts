import type { Metadata } from "next";
import { channelPath, channelProfiles } from "./channel-aliases";

export const SITE_URL = "https://timeline.oshi.tw";
export const SITE_TITLE = "timeline.oshi.tw — 直播時間軸";
export const SITE_DESCRIPTION = "台灣 VTuber 直播動態河道";

export function channelMetadata(channelId: string): Metadata {
  const profile = channelProfiles[channelId];
  if (!profile) throw new Error(`Unknown channel profile: ${channelId}`);
  const title = `${profile.name} 的直播時間軸｜timeline.oshi.tw`;
  const description = `追蹤 ${profile.name} 的直播中、預定開台、歷史直播與重要里程碑。`;
  const url = new URL(channelPath(channelId)!, SITE_URL).href;
  const images = [{ url: profile.avatar ?? `${SITE_URL}/icon.png`, alt: profile.name }];
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "zh_TW", siteName: "timeline.oshi.tw", title, description, url, images },
    twitter: { card: "summary", title, description, images },
  };
}
