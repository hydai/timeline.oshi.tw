"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveIndexUrl, archiveMonthUrl, fetchArchiveIndex, fetchArchiveMonth, fetchSnapshot,
} from "@/lib/snapshot";
import { buildArchiveTimeline, buildTimeline, mergeTimelines } from "@/lib/timeline";
import {
  archiveMonthCount, archiveTotal, filterArchiveIndex, formatArchiveMonth, itemArchiveMonth, latestArchiveMonth,
  stepArchiveMonth, withPendingMilestones,
} from "@/lib/archive-nav";
import {
  buildTimelineFilterStats,
  filterTimeline,
} from "@/lib/filter";
import type { ArchiveIndex, ArchiveMonth, Snapshot, TimelineItem } from "@/lib/types";
import type { RailMode } from "@/lib/rail";
import { taipeiDayKey } from "@/lib/time";
import Header from "./Header";
import TimelineLoading from "./TimelineLoading";
import CommandBar from "./CommandBar";
import Timeline from "./Timeline";
import ArchiveNavigator from "./ArchiveNavigator";
import ChannelAvatar from "./ChannelAvatar";
import ShareControls from "./ShareControls";
import { useTimelineUrl } from "./useTimelineUrl";
import { channelProfiles } from "@/lib/channel-aliases";
import { EMPTY_SELECTION, isArchiveMonth, timelineHref } from "@/lib/timeline-url";

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "https://data.oshi.tw/streams/v1/snapshot.json";
const ARCHIVE_INDEX_URL = archiveIndexUrl(SNAPSHOT_URL);

function isCurrentActivity(item: TimelineItem, today: string): boolean {
  return item.kind === "live" || item.kind === "upcoming" ||
    (item.kind === "milestone" && item.milestone.date > today);
}

export default function TimelinePage({ name }: { name?: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<ArchiveIndex | null>(null);
  const [archiveError, setArchiveError] = useState(false);
  const [error, setError] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);

  const load = useCallback((force = false) => {
    setError(false);
    const receiveSnapshot = (data: Snapshot) => { if (mounted.current) setSnap(data); };
    const receiveIndex = (data: ArchiveIndex) => {
      if (!mounted.current) return;
      setArchiveIndex(data);
      setArchiveError(false);
    };
    fetchSnapshot(SNAPSHOT_URL, { force, onCached: receiveSnapshot })
      .then(receiveSnapshot)
      .catch(() => { if (mounted.current) setError(true); });
    fetchArchiveIndex(ARCHIVE_INDEX_URL, { force, onCached: receiveIndex })
      .then(receiveIndex)
      .catch(() => { if (mounted.current) setArchiveError(true); });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const dataTimer = setInterval(load, 300_000);
    const clockTimer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      mounted.current = false;
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [load]);

  return (
    <div className="relative mx-auto min-h-screen max-w-[1120px] px-4 py-6">
      <div className="pointer-events-none absolute -top-20 -right-20 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute top-40 -left-20 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" aria-hidden />
      <div className="relative z-10">
        <Header updatedAt={snap?.generated_at ?? ""} nowMs={nowMs} />
        {snap && error && (
          <p role="status" className="mb-3 text-xs text-text-secondary">
            資料更新失敗，暫時顯示上次載入的資料。
            <button type="button" onClick={() => load(true)} className="ml-2 underline">重試更新</button>
          </p>
        )}
        {/* Only URL-dependent content waits for search params; the shell and home
            link remain in the exported HTML, before any JavaScript has run. */}
        <Suspense fallback={<TimelineLoading name={name} />}>
          <TimelineContent snap={snap} archiveIndex={archiveIndex} error={error}
            archiveError={archiveError} nowMs={nowMs} load={load} />
        </Suspense>
      </div>
    </div>
  );
}

function TimelineContent({ snap, archiveIndex, error, archiveError, nowMs, load }: {
  snap: Snapshot | null;
  archiveIndex: ArchiveIndex | null;
  error: boolean;
  archiveError: boolean;
  nowMs: number;
  load: (force?: boolean) => void;
}) {
  const { selection, update } = useTimelineUrl();
  const { query, selectedGroup, selectedChannelId, selectedKind, month: pickedMonth } = selection;
  const [archiveCache, setArchiveCache] = useState<Record<string, ArchiveMonth>>({});
  const [monthRetry, setMonthRetry] = useState(0);
  const previousRetry = useRef(0);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [monthError, setMonthError] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const snapshotTimeline = useMemo(() => snap ? buildTimeline(snap) : [], [snap]);
  const today = taipeiDayKey(new Date(nowMs).toISOString());
  // All always includes both current activity and monthly history. The month only
  // scopes history; changing it must never hide a live stream or an upcoming event.
  const historyKind = selectedKind === null ? "all"
    : selectedKind === "recent" || selectedKind === "milestone" ? selectedKind : null;
  const currentItems = useMemo(() => selectedKind === null
    ? filterTimeline(snapshotTimeline, query, selectedChannelId, null, selectedGroup)
      .filter((item) => isCurrentActivity(item, today))
    : [], [query, selectedChannelId, selectedGroup, selectedKind, snapshotTimeline, today]);

  // What the navigator counts: the archive plus the milestones still ahead of it, which
  // reach the rail on the snapshot. Fetching still goes by archiveIndex — a month that
  // exists only because of a pending milestone has no file to ask for.
  const navIndex = useMemo(() => (archiveIndex && snap
    ? withPendingMilestones(archiveIndex, snap.milestones, archiveIndex.generated_at.slice(0, 10))
    : archiveIndex), [archiveIndex, snap]);
  // Future milestones are already visible in All's current section. Including them
  // in its month picker could open a future anniversary month and hide recent history.
  const historyIndex = useMemo(() => selectedKind === null && archiveIndex && snap
    ? withPendingMilestones(archiveIndex, snap.milestones.filter((milestone) => milestone.date <= today), archiveIndex.generated_at.slice(0, 10))
    : navIndex, [archiveIndex, navIndex, selectedKind, snap, today]);

  const channelDirectory = useMemo(() => {
    const archived = Object.values(archiveCache).reduce<Record<string, Snapshot["channels"][string]>>(
      (channels, month) => Object.assign(channels, month.channels),
      {},
    );
    return { ...archived, ...(snap?.channels ?? {}) };
  }, [archiveCache, snap]);
  const scopedNavIndex = useMemo(() => (historyIndex
    ? filterArchiveIndex(historyIndex, channelDirectory, query, selectedChannelId, selectedGroup)
    : null), [channelDirectory, historyIndex, query, selectedChannelId, selectedGroup]);

  const archiveMonth = useMemo(() => {
    if (!historyKind || !scopedNavIndex) return null;
    if (pickedMonth) return isArchiveMonth(pickedMonth) ? pickedMonth : null;
    return latestArchiveMonth(scopedNavIndex, historyKind);
  }, [historyKind, pickedMonth, scopedNavIndex]);

  const monthUnavailable = Boolean(historyKind && pickedMonth && (
    !isArchiveMonth(pickedMonth) || (scopedNavIndex && !scopedNavIndex.months.some((month) =>
      month.month === pickedMonth && archiveMonthCount(month, historyKind) > 0))
  ));

  // Persisted months appear before revalidation. Index polling also checks the open
  // month's TTL, so backfills and removals eventually reach an already-open page.
  useEffect(() => {
    const force = previousRetry.current !== monthRetry;
    previousRetry.current = monthRetry;
    const archived = archiveIndex?.months.some((month) => month.month === archiveMonth);
    if (!archiveMonth || !archived || monthUnavailable) {
      setArchiveLoading(false);
      setMonthError(false);
      return;
    }
    let cancelled = false;
    setArchiveLoading(true);
    setMonthError(false);
    const receiveMonth = (data: ArchiveMonth) => {
      if (cancelled) return;
      setArchiveCache((cache) => ({ ...cache, [data.month]: data }));
      setArchiveLoading(false);
    };
    fetchArchiveMonth(archiveMonthUrl(ARCHIVE_INDEX_URL, archiveMonth), { force, onCached: receiveMonth })
      .then(receiveMonth)
      .catch(() => { if (!cancelled) setMonthError(true); })
      .finally(() => { if (!cancelled) setArchiveLoading(false); });
    return () => { cancelled = true; };
  }, [archiveIndex, archiveMonth, monthRetry, monthUnavailable]);

  const archiveData = archiveMonth ? archiveCache[archiveMonth] ?? null : null;
  const timeline = useMemo(() => mergeTimelines(
    snapshotTimeline, archiveData ? buildArchiveTimeline([archiveData]) : [],
  ), [archiveData, snapshotTimeline]);
  const waitingForHistory = Boolean(historyKind && (
    (!scopedNavIndex && !archiveError) ||
    (archiveMonth && archiveIndex?.months.some((month) => month.month === archiveMonth) && !archiveData && !monthError)
  ));

  const filterStats = useMemo(() => buildTimelineFilterStats(
    // Complete archive facets already count loaded months. Opening a different month
    // must not change the global totals by adding its rows to the snapshot again.
    navIndex?.facets === "channel" ? snapshotTimeline : timeline,
    navIndex,
    channelDirectory,
    snap?.groups ?? [],
    { query, selectedChannelId, selectedKind, selectedGroup },
  ), [channelDirectory, navIndex, query, selectedChannelId, selectedGroup, selectedKind, snap?.groups, snapshotTimeline, timeline]);
  const kindCounts = useMemo(() => {
    if (!scopedNavIndex) return filterStats.kindCounts;
    return {
      ...filterStats.kindCounts,
      recent: Math.max(filterStats.kindCounts.recent, archiveTotal(scopedNavIndex, "recent")),
      milestone: Math.max(filterStats.kindCounts.milestone, archiveTotal(scopedNavIndex, "milestone")),
    };
  }, [filterStats.kindCounts, scopedNavIndex]);
  const items = useMemo(() => {
    if (historyKind && pickedMonth && !archiveMonth) return [];
    const filtered = filterTimeline(timeline, query, selectedChannelId, selectedKind, selectedGroup)
      .filter((item) => selectedKind !== null || !isCurrentActivity(item, today));
    // History reads one archive month at a time; without this the current snapshot's own
    // finished streams would ride along under whatever month is on screen.
    if (!historyKind || !archiveMonth) return filtered;
    return filtered.filter((item) => itemArchiveMonth(item) === archiveMonth);
  }, [archiveMonth, historyKind, pickedMonth, query, selectedChannelId, selectedGroup, selectedKind, timeline, today]);
  // Finished streams and milestones read newest-first; everything else reads forward from now.
  const railMode: RailMode = historyKind ? "history" : "forward";
  const historyTotal = scopedNavIndex && historyKind ? archiveTotal(scopedNavIndex, historyKind) : 0;
  const olderMonth = scopedNavIndex && historyKind && archiveMonth
    ? stepArchiveMonth(scopedNavIndex, historyKind, archiveMonth, -1)
    : null;

  const goToMonth = (month: string) => {
    update({ month });
    railRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedChannel = selectedChannelId
    ? (Object.hasOwn(channelDirectory, selectedChannelId) ? channelDirectory[selectedChannelId] : undefined)
      ?? channelProfiles[selectedChannelId]
    : null;
  const channelInArchive = selectedChannelId && archiveIndex?.months.some((month) =>
    Object.hasOwn(month.by_channel ?? {}, selectedChannelId));
  const unknownChannel = Boolean(selectedChannelId && snap && archiveIndex && !selectedChannel && !channelInArchive);
  const shareHref = timelineHref({ ...selection, month: historyKind ? pickedMonth ?? archiveMonth : null });
  const channelHref = selectedChannelId && !unknownChannel
    ? timelineHref({ ...EMPTY_SELECTION, selectedChannelId }) : null;

  return (
    <>
        {!snap && error ? (
          <div role="status" aria-live="polite" className="glass mx-auto max-w-2xl rounded-2xl p-6 text-center text-text-secondary">
            <p>載入失敗，請稍後再試。</p>
            <button type="button" onClick={() => load(true)} className="glass mt-3 rounded-pill px-4 py-1 text-sm text-text-secondary">重試</button>
          </div>
        ) : !snap ? (
          <div role="status" aria-live="polite" className="glass mx-auto max-w-2xl rounded-2xl p-6 text-center text-text-secondary">載入中…</div>
        ) : (
          <div className="min-w-0">
            {selectedChannel && (
              <div className="mb-3 flex items-center gap-3">
                <ChannelAvatar key={selectedChannelId} src={selectedChannel.avatar} name={selectedChannel.name} size={44} />
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-text-primary">{selectedChannel.name}</h2>
                  <p className="text-xs text-text-secondary">直播動態與重要里程碑</p>
                </div>
              </div>
            )}
            <ShareControls href={shareHref} channelHref={channelHref} />
            <CommandBar
              query={query}
              onQueryChange={(value) => update({ query: value }, "replace")}
              groups={filterStats.groups}
              selectedGroup={selectedGroup}
              onGroupSelect={(group) => update({ selectedGroup: group })}
              totalCount={filterStats.groupTotalCount}
              vtubers={filterStats.vtubers}
              selectedChannelId={selectedChannelId}
              onChannelSelect={(channelId) => update({ selectedChannelId: channelId })}
              groupedCount={filterStats.vtuberTotalCount}
              kindCounts={kindCounts}
              selectedKind={selectedKind}
              onKindSelect={(kind) => update({ selectedKind: kind })}
            />
            <p className="mt-2 px-1 text-xs text-text-secondary">
              類型旁的數字包含所有月份；歷史紀錄依月份瀏覽。
            </p>
            {(selectedKind === "recent" || selectedKind === "milestone") && scopedNavIndex && (
              <ArchiveNavigator
                index={scopedNavIndex}
                kind={selectedKind}
                month={archiveMonth}
                onSelect={(month) => update({ month })}
                onRetry={() => setMonthRetry((attempt) => attempt + 1)}
                loading={archiveLoading}
                error={monthError}
              />
            )}
            {selectedKind === null && currentItems.length > 0 && (
              <section aria-labelledby="current-activity-heading" className="mt-5">
                <h2 id="current-activity-heading" className="mb-3 text-base font-extrabold text-text-primary">
                  直播與預定活動
                  <span className="ml-2 text-xs font-semibold text-text-secondary">{currentItems.length} 筆</span>
                </h2>
                <Timeline
                  items={currentItems}
                  nowMs={nowMs}
                  mode="forward"
                  onShowFinished={() => update({ selectedKind: "recent" })}
                />
              </section>
            )}
            <div ref={railRef} className="mt-5 scroll-mt-20">
              {unknownChannel ? (
                <div role="status" className="glass rounded-2xl p-6 text-center text-text-secondary">
                  <p>找不到這個 VTuber，連結中的頻道可能尚未收錄。</p>
                  <button type="button" className="mt-3 rounded-pill px-4 py-2 font-semibold text-text-primary" onClick={() => update({ selectedChannelId: null })}>查看全部 VTuber</button>
                </div>
              ) : monthUnavailable ? (
                <div role="status" className="glass rounded-2xl p-6 text-center text-text-secondary">
                  <p>{pickedMonth && isArchiveMonth(pickedMonth)
                    ? `${formatArchiveMonth(pickedMonth)} 沒有符合篩選的封存。`
                    : "連結中的月份格式無效，請重新選擇月份。"}</p>
                  <button type="button" className="mt-3 rounded-pill px-4 py-2 font-semibold text-text-primary" onClick={() => update({ month: null })}>查看最新月份</button>
                </div>
              ) : waitingForHistory ? (
                <div role="status" className="glass rounded-2xl p-6 text-center text-text-secondary">
                  正在讀取歷史紀錄…
                </div>
              ) : historyKind && ((monthError && !archiveData) || (!archiveIndex && archiveError)) ? (
                <div role="status" className="glass rounded-2xl p-6 text-center text-text-secondary">
                  歷史紀錄暫時無法載入，請稍後重試。
                </div>
              ) : !(selectedKind === null && items.length === 0 && currentItems.length > 0) && (
                <>
                  {selectedKind === null && items.length > 0 && (
                    <h2 className="mb-3 text-base font-extrabold text-text-primary">
                      歷史紀錄
                      {archiveMonth && <span className="ml-2 text-xs font-semibold text-text-secondary">{formatArchiveMonth(archiveMonth)}</span>}
                    </h2>
                  )}
                  <Timeline
                    items={items}
                    nowMs={nowMs}
                    mode={railMode}
                    onShowFinished={() => update({ selectedKind: "recent" })}
                  />
                </>
              )}
              {historyKind && !monthUnavailable && !unknownChannel && (
                <div className="mt-5 flex flex-col items-center gap-2 text-center text-xs text-text-secondary" aria-live="polite">
                  {!scopedNavIndex && !archiveError && <span>正在讀取永久封存…</span>}
                  {selectedKind === null && monthError && (
                    <button
                      type="button"
                      onClick={() => setMonthRetry((attempt) => attempt + 1)}
                      className="glass rounded-pill px-4 py-2 text-sm font-semibold text-text-primary"
                    >
                      重新載入這個月
                    </button>
                  )}
                  {archiveError && (
                    <button
                      type="button"
                      onClick={() => load(true)}
                      className="glass rounded-pill px-4 py-2 text-sm font-semibold text-text-primary"
                    >
                      重試讀取封存
                    </button>
                  )}
                  {scopedNavIndex && historyTotal === 0 && (
                    <span>
                      {historyKind === "recent" ? "目前還沒有已完成直播封存。"
                        : historyKind === "milestone" ? "目前還沒有已發生的里程碑封存。" : "目前還沒有歷史封存。"}
                    </span>
                  )}
                  {olderMonth && (
                    <button
                      type="button"
                      onClick={() => goToMonth(olderMonth)}
                      disabled={archiveLoading}
                      className="glass rounded-pill px-4 py-2 text-sm font-semibold text-text-primary disabled:cursor-wait disabled:opacity-60"
                    >
                      看更早的 {formatArchiveMonth(olderMonth)}
                    </button>
                  )}
                  {scopedNavIndex && historyTotal > 0 && !olderMonth && (
                    <span>這是封存裡最早的月份。</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );
}
