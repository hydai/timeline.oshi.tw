import { describe, expect, it } from "vitest";
import { channelAliases, channelIdFromPath, channelIdFromSlug, channelPath, channelProfiles, indexChannelAliases } from "@/lib/channel-aliases";
import { changeTimelineSelection, EMPTY_SELECTION, parseTimelineUrl, timelineHref } from "@/lib/timeline-url";
import { UNGROUPED_FILTER_VALUE } from "@/lib/filter";
import { channelMetadata } from "@/lib/site";

const MIZUKI = "UCjv4bfP_67WLuPheS-Z8Ekg";
const parse = (url: string) => { const u = new URL(url, "https://timeline.oshi.tw"); return parseTimelineUrl(u.pathname, u.searchParams); };

describe("timeline URLs", () => {
  it("makes an alias and an ID link equivalent with every other filter intact", () => {
    const suffix = "group=子午計畫&type=recent&q=浠&month=2026-08";
    expect(parse(`/v/mizuki?${suffix}`)).toEqual(parse(`/?channel=${MIZUKI}&${suffix}`));
    expect(parse(`/v/mizuki?channel=someone-else&${suffix}`).selectedChannelId).toBe(MIZUKI);
  });

  it("round trips encoded names, groups, and a chosen month", () => {
    const selection = { ...EMPTY_SELECTION, selectedChannelId: MIZUKI, selectedGroup: "A & B", query: "名字 + @handle", selectedKind: "recent" as const, month: "2026-08" };
    const href = timelineHref(selection);
    expect(href).toMatch(/^\/v\/mizuki\?/);
    expect(parse(href)).toEqual(selection);
  });

  it("shares all-types history months and ignores months for live or upcoming filters", () => {
    const selection = { ...EMPTY_SELECTION, selectedChannelId: MIZUKI, month: "2026-08" };
    const href = timelineHref(selection);
    expect(href).toBe("/v/mizuki?month=2026-08");
    expect(parse(href)).toEqual(selection);
    expect(changeTimelineSelection(selection, { month: "2026-07" }).month).toBe("2026-07");
    expect(changeTimelineSelection(selection, { selectedKind: "live" }).month).toBeNull();
    expect(parse("/?type=upcoming&month=2026-08").month).toBeNull();
    expect(parse("/?month=invalid").month).toBe("invalid");
  });

  it("keeps unknown channels as ID links and handles nullable/default values", () => {
    expect(timelineHref(EMPTY_SELECTION)).toBe("/");
    expect(timelineHref({ ...EMPTY_SELECTION, selectedChannelId: "new-channel" })).toBe("/?channel=new-channel");
    expect(timelineHref({ ...EMPTY_SELECTION, selectedChannelId: "constructor" })).toBe("/?channel=constructor");
    expect(parse("/?type=unsupported&month=2026-06")).toEqual(EMPTY_SELECTION);
    expect(parse("/?type=recent&month=../../bad").month).toBe("../../bad");
  });

  it("uses a readable ungrouped value and preserves unrelated parameters during browsing", () => {
    const href = timelineHref({ ...EMPTY_SELECTION, selectedGroup: UNGROUPED_FILTER_VALUE }, { params: new URLSearchParams("utm_source=campaign&channel=old&type=live") });
    expect(href).toBe("/?utm_source=campaign&group=ungrouped");
    expect(parse(href).selectedGroup).toBe(UNGROUPED_FILTER_VALUE);
  });

  it("resets a month only on actual UI filter changes and clears incompatible channel selections", () => {
    const current = parse(`/?channel=${MIZUKI}&type=recent&month=2026-08`);
    expect(changeTimelineSelection(current, { selectedKind: "recent" })).toEqual(current);
    expect(changeTimelineSelection(current, { selectedKind: "milestone" }).month).toBeNull();
    expect(changeTimelineSelection(current, { selectedGroup: "新團體" })).toMatchObject({ selectedChannelId: null, month: null });
  });
});

describe("published aliases", () => {
  it("resolves all primary and legacy aliases to the same stable channel ID", () => {
    for (const [slug, channelId] of channelAliases) {
      expect(channelIdFromSlug(slug)).toBe(channelId);
      expect(channelIdFromSlug(encodeURIComponent(slug))).toBe(channelId);
      expect(channelIdFromPath(`/v/${encodeURIComponent(slug)}`)).toBe(channelId);
      expect(channelPath(channelId)).toBe(`/v/${encodeURIComponent(channelProfiles[channelId]!.slug)}`);
    }
    expect(channelIdFromPath("/v/%broken")).toBeNull();
    expect(channelIdFromPath("/v/unknown")).toBeNull();
  });

  it("rejects a duplicate alias instead of pointing a published URL at a different person", () => {
    expect(() => indexChannelAliases({
      [MIZUKI]: { slug: "duplicate", aliases: [], name: "A", avatar: null },
      UCCHsCWNTcGJ8Jml_oZ6nG2Q: { slug: "gabu", aliases: ["duplicate"], name: "B", avatar: null },
    })).toThrow("Duplicate channel alias");
  });

  it("gives each alias page server-renderable personal metadata and a stable canonical URL", () => {
    const metadata = channelMetadata(MIZUKI);
    expect(metadata.title).toContain("浠Mizuki");
    expect(metadata.alternates?.canonical).toBe("https://timeline.oshi.tw/v/mizuki");
    expect(metadata.openGraph).toMatchObject({ url: "https://timeline.oshi.tw/v/mizuki", images: [{ url: channelProfiles[MIZUKI]!.avatar, alt: channelProfiles[MIZUKI]!.name }] });
  });
});
