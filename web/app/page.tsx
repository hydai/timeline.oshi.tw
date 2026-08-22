"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveIndexUrl, archiveMonthUrl, fetchArchiveIndex, fetchArchiveMonth, fetchSnapshot,
} from "@/lib/snapshot";
import { buildArchiveTimeline, buildTimeline, mergeTimelines } from "@/lib/timeline";
import {
  archiveTotal, formatArchiveMonth, itemArchiveMonth, latestArchiveMonth, stepArchiveMonth,
} from "@/lib/archive-nav";
import {
  buildGroupFilterOptions,
  buildTimelineKindCounts,
  buildVTuberFilterOptions,
  filterTimeline,
  type GroupFilterValue,
  type TimelineKind,
} from "@/lib/filter";
import type { ArchiveIndex, ArchiveMonth, Snapshot } from "@/lib/types";
import type { RailMode } from "@/lib/rail";
import Header from "./components/Header";
import CommandBar from "./components/CommandBar";
import Timeline from "./components/Timeline";
import ArchiveNavigator from "./components/ArchiveNavigator";

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "https://data.oshi.tw/streams/v1/snapshot.json";
const ARCHIVE_INDEX_URL = archiveIndexUrl(SNAPSHOT_URL);

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<ArchiveIndex | null>(null);
  const [archiveCache, setArchiveCache] = useState<Record<string, ArchiveMonth>>({});
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [monthRetry, setMonthRetry] = useState(0);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState(false);
  const [monthError, setMonthError] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupFilterValue>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<TimelineKind | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);
  const railRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setError(false);
    fetchSnapshot(SNAPSHOT_URL)
      .then((s) => { if (mounted.current) setSnap(s); })
      .catch(() => { if (mounted.current) setError(true); });
    fetchArchiveIndex(ARCHIVE_INDEX_URL)
      .then((index) => {
        if (!mounted.current) return;
        setArchiveIndex(index);
        setArchiveError(false);
      })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is a permanently stable useCallback([]) reference; run once on mount.
  }, []);

  const historyKind = selectedKind === "recent" || selectedKind === "milestone" ? selectedKind : null;

  // A month full of streams can hold no milestones at all, so a pick made under one
  // kind is not a pick under the other.
  useEffect(() => { setPickedMonth(null); }, [historyKind]);

  const archiveMonth = useMemo(() => {
    if (!historyKind || !archiveIndex) return null;
    return pickedMonth ?? latestArchiveMonth(archiveIndex, historyKind);
  }, [archiveIndex, historyKind, pickedMonth]);

  // One month in flight at a time — that is the whole point of navigating instead of
  // accumulating. Months already read stay in memory (data, not DOM) so stepping is free.
  useEffect(() => {
    // Clearing on the cache-hit path too: a month already in hand starts no fetch, and
    // a previous month's failure would otherwise stay on screen over working data.
    if (!archiveMonth || archiveCache[archiveMonth]) {
      setMonthError(false);
      return;
    }
    let cancelled = false;
    setArchiveLoading(true);
    setMonthError(false);
    fetchArchiveMonth(archiveMonthUrl(ARCHIVE_INDEX_URL, archiveMonth))
      .then((data) => {
        if (cancelled || !mounted.current) return;
        setArchiveCache((cache) => ({ ...cache, [data.month]: data }));
      })
      .catch(() => { if (!cancelled && mounted.current) setMonthError(true); })
      .finally(() => { if (!cancelled && mounted.current) setArchiveLoading(false); });
    return () => { cancelled = true; };
  }, [archiveCache, archiveMonth, monthRetry]);

  const archiveData = archiveMonth ? archiveCache[archiveMonth] ?? null : null;

  const timeline = useMemo(() => {
    const current = snap ? buildTimeline(snap) : [];
    return mergeTimelines(current, archiveData ? buildArchiveTimeline([archiveData]) : []);
  }, [archiveData, snap]);
  const groups = useMemo(
    () => buildGroupFilterOptions(timeline, snap?.groups ?? []),
    [snap?.groups, timeline],
  );
  const groupedTimeline = useMemo(
    () => filterTimeline(timeline, "", null, null, selectedGroup),
    [selectedGroup, timeline],
  );
  const vtubers = useMemo(() => buildVTuberFilterOptions(groupedTimeline), [groupedTimeline]);
  const kindCounts = useMemo(() => {
    const loaded = buildTimelineKindCounts(groupedTimeline);
    if (selectedGroup || !archiveIndex || !snap) return loaded;
    const generatedDate = snap.generated_at.slice(0, 10);
    const futureMilestones = snap.milestones.filter((milestone) => milestone.date > generatedDate).length;
    return {
      ...loaded,
      recent: Math.max(loaded.recent, archiveTotal(archiveIndex, "recent")),
      milestone: Math.max(loaded.milestone, archiveTotal(archiveIndex, "milestone") + futureMilestones),
    };
  }, [archiveIndex, groupedTimeline, selectedGroup, snap]);
  const items = useMemo(() => {
    const filtered = filterTimeline(timeline, query, selectedChannelId, selectedKind, selectedGroup);
    // History reads one archive month at a time; without this the current snapshot's own
    // finished streams would ride along under whatever month is on screen.
    if (!historyKind || !archiveMonth) return filtered;
    return filtered.filter((item) => itemArchiveMonth(item) === archiveMonth);
  }, [archiveMonth, historyKind, query, selectedChannelId, selectedGroup, selectedKind, timeline]);
  // Finished streams and milestones read newest-first; everything else reads forward from now.
  const railMode: RailMode = historyKind ? "history" : "forward";
  const historyTotal = archiveIndex && historyKind ? archiveTotal(archiveIndex, historyKind) : 0;
  const olderMonth = archiveIndex && historyKind && archiveMonth
    ? stepArchiveMonth(archiveIndex, historyKind, archiveMonth, -1)
    : null;

  const goToMonth = (month: string) => {
    setPickedMonth(month);
    railRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative mx-auto min-h-screen max-w-[1120px] px-4 py-6">
      <div className="pointer-events-none absolute -top-20 -right-20 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute top-40 -left-20 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" aria-hidden />
      <div className="relative z-10">
        <Header updatedAt={snap?.generated_at ?? ""} nowMs={nowMs} />
        {!snap && error ? (
          <div role="status" aria-live="polite" className="glass mx-auto max-w-2xl rounded-2xl p-6 text-center text-text-secondary">
            <p>載入失敗，請稍後再試。</p>
            <button type="button" onClick={load} className="glass mt-3 rounded-pill px-4 py-1 text-sm text-text-secondary">重試</button>
          </div>
        ) : !snap ? (
          <div role="status" aria-live="polite" className="glass mx-auto max-w-2xl rounded-2xl p-6 text-center text-text-secondary">載入中…</div>
        ) : (
          <div className="min-w-0">
            <CommandBar
              query={query}
              onQueryChange={setQuery}
              groups={groups}
              selectedGroup={selectedGroup}
              onGroupSelect={(group) => {
                if (group !== selectedGroup) setSelectedChannelId(null);
                setSelectedGroup(group);
              }}
              totalCount={timeline.length}
              vtubers={vtubers}
              selectedChannelId={selectedChannelId}
              onChannelSelect={setSelectedChannelId}
              groupedCount={groupedTimeline.length}
              kindCounts={kindCounts}
              selectedKind={selectedKind}
              onKindSelect={setSelectedKind}
            />
            {historyKind && archiveIndex && (
              <ArchiveNavigator
                index={archiveIndex}
                kind={historyKind}
                month={archiveMonth}
                onSelect={setPickedMonth}
                onRetry={() => setMonthRetry((attempt) => attempt + 1)}
                loading={archiveLoading}
                error={monthError}
              />
            )}
            <div ref={railRef} className="mt-5 scroll-mt-20">
              <Timeline
                items={items}
                nowMs={nowMs}
                mode={railMode}
                onShowFinished={() => setSelectedKind("recent")}
              />
              {historyKind && (
                <div className="mt-5 flex flex-col items-center gap-2 text-center text-xs text-text-secondary" aria-live="polite">
                  {!archiveIndex && !archiveError && <span>正在讀取永久封存…</span>}
                  {archiveError && (
                    <button
                      type="button"
                      onClick={load}
                      className="glass rounded-pill px-4 py-2 text-sm font-semibold text-text-primary"
                    >
                      重試讀取封存
                    </button>
                  )}
                  {archiveIndex && historyTotal === 0 && (
                    <span>
                      {historyKind === "recent" ? "目前還沒有已完成直播封存。" : "目前還沒有已發生的里程碑封存。"}
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
                  {archiveIndex && historyTotal > 0 && !olderMonth && (
                    <span>這是封存裡最早的月份。</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
