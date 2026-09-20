"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { channelIdFromPath } from "@/lib/channel-aliases";
import { changeTimelineSelection, parseTimelineUrl, timelineHref, type TimelineSelection } from "@/lib/timeline-url";

export function useTimelineUrl() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const selection = useMemo(() => parseTimelineUrl(pathname, new URLSearchParams(search)), [pathname, search]);

  useEffect(() => {
    // The alias owns the channel dimension, including on a directly opened link.
    if (channelIdFromPath(pathname) && new URLSearchParams(search).has("channel")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("channel");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [pathname, search]);

  const update = useCallback((patch: Partial<TimelineSelection>, mode: "push" | "replace" = "push") => {
    // Read the latest URL, including an input edit made before React's next render.
    const url = new URL(window.location.href);
    const current = parseTimelineUrl(url.pathname, url.searchParams);
    const next = changeTimelineSelection(current, patch);
    const href = timelineHref(next, {
      // Preserve an ID link or old alias while editing other dimensions.
      pathname: next.selectedChannelId === current.selectedChannelId ? url.pathname : undefined,
      preferAlias: next.selectedChannelId !== current.selectedChannelId || url.pathname !== "/",
      params: url.searchParams,
    }) + url.hash;
    if (href === `${url.pathname}${url.search}${url.hash}`) return;
    if (new URL(href, url).pathname !== url.pathname) {
      // A real route transition also updates the page's static metadata.
      router[mode](href, { scroll: false });
    } else {
      window.history[mode === "push" ? "pushState" : "replaceState"](null, "", href);
    }
  }, [router]);

  return { selection, update };
}
