import { channelIdFromPath, channelPath } from "./channel-aliases";
import { UNGROUPED_FILTER_VALUE, type TimelineFilterSelection, type TimelineKind } from "./filter";

export interface TimelineSelection extends TimelineFilterSelection {
  month: string | null;
}

export const EMPTY_SELECTION: TimelineSelection = {
  query: "", selectedGroup: null, selectedChannelId: null, selectedKind: null, month: null,
};
const FILTER_KEYS = ["channel", "group", "type", "q", "month"];
const KINDS = new Set<TimelineKind>(["live", "upcoming", "recent", "milestone"]);

export const isArchiveMonth = (month: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
export const supportsArchiveMonth = (kind: TimelineKind | null): boolean => kind === null || kind === "recent" || kind === "milestone";

export function parseTimelineUrl(pathname: string, params: URLSearchParams): TimelineSelection {
  const kind = params.get("type") as TimelineKind | null;
  const selectedKind = kind && KINDS.has(kind) ? kind : null;
  const group = params.get("group")?.trim() || null;
  return {
    query: params.get("q") ?? "",
    selectedChannelId: channelIdFromPath(pathname) ?? (params.get("channel")?.trim() || null),
    selectedGroup: group === "ungrouped" ? UNGROUPED_FILTER_VALUE : group,
    selectedKind,
    // Keep an explicit invalid month so the UI can explain it, rather than silently
    // opening a different month. It is never interpolated into a fetch URL.
    month: (!kind || KINDS.has(kind)) && supportsArchiveMonth(selectedKind) ? params.get("month") || null : null,
  };
}

export function timelineHref(
  selection: TimelineSelection,
  { pathname, params, preferAlias = true }: {
    pathname?: string;
    params?: URLSearchParams;
    preferAlias?: boolean;
  } = {},
): string {
  const channelId = selection.selectedChannelId;
  const path = channelId && pathname && channelIdFromPath(pathname) === channelId
    ? pathname
    : channelId && preferAlias ? channelPath(channelId) ?? "/" : "/";
  const query = new URLSearchParams(params);
  for (const key of FILTER_KEYS) query.delete(key);
  if (channelId && path === "/") query.set("channel", channelId);
  if (selection.selectedGroup) query.set("group", selection.selectedGroup === UNGROUPED_FILTER_VALUE
    ? "ungrouped" : selection.selectedGroup);
  if (selection.selectedKind) query.set("type", selection.selectedKind);
  if (selection.query) query.set("q", selection.query);
  if (selection.month && supportsArchiveMonth(selection.selectedKind)) query.set("month", selection.month);
  return `${path}${query.size ? `?${query}` : ""}`;
}

/** Only deliberate filter changes reset the month; restoring a URL is atomic. */
export function changeTimelineSelection(
  selection: TimelineSelection, patch: Partial<TimelineSelection>,
): TimelineSelection {
  const next = { ...selection, ...patch };
  const changed = (["query", "selectedGroup", "selectedChannelId", "selectedKind"] as const)
    .some((key) => selection[key] !== next[key]);
  if (changed && !("month" in patch)) next.month = null;
  if ("selectedGroup" in patch && patch.selectedGroup !== selection.selectedGroup && !("selectedChannelId" in patch)) {
    next.selectedChannelId = null;
  }
  if (!supportsArchiveMonth(next.selectedKind)) next.month = null;
  return next;
}
