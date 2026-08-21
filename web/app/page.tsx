"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveIndexUrl, archiveMonthUrl, fetchArchiveIndex, fetchArchiveMonth, fetchSnapshot,
} from "@/lib/snapshot";
import { buildArchiveTimeline, buildTimeline, mergeTimelines } from "@/lib/timeline";
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

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "https://data.oshi.tw/streams/v1/snapshot.json";
const ARCHIVE_INDEX_URL = archiveIndexUrl(SNAPSHOT_URL);

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<ArchiveIndex | null>(null);
  const [archiveMonths, setArchiveMonths] = useState<ArchiveMonth[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<GroupFilterValue>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<TimelineKind | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);
  const archiveLoadingRef = useRef(false);
  const autoLoadedKindRef = useRef<TimelineKind | null>(null);

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
  const nextArchive = useMemo(() => {
    if (!archiveIndex || !historyKind) return null;
    const loaded = new Set(archiveMonths.map((month) => month.month));
    return archiveIndex.months.find((month) =>
      !loaded.has(month.month) && (historyKind === "recent" ? month.streams > 0 : month.milestones > 0),
    ) ?? null;
  }, [archiveIndex, archiveMonths, historyKind]);

  const loadNextArchiveMonth = useCallback(async () => {
    if (!nextArchive || archiveLoadingRef.current) return;
    archiveLoadingRef.current = true;
    setArchiveLoading(true);
    setArchiveError(false);
    try {
      const month = await fetchArchiveMonth(archiveMonthUrl(ARCHIVE_INDEX_URL, nextArchive.month));
      if (!mounted.current) return;
      setArchiveMonths((current) => current.some((item) => item.month === month.month)
        ? current
        : [...current, month]);
    } catch {
      if (mounted.current) setArchiveError(true);
    } finally {
      archiveLoadingRef.current = false;
      if (mounted.current) setArchiveLoading(false);
    }
  }, [nextArchive]);

  useEffect(() => {
    if (!historyKind) {
      autoLoadedKindRef.current = null;
      return;
    }
    if (archiveLoading || !nextArchive || autoLoadedKindRef.current === historyKind) return;
    autoLoadedKindRef.current = historyKind;
    void loadNextArchiveMonth();
  }, [archiveLoading, historyKind, loadNextArchiveMonth, nextArchive]);

  const timeline = useMemo(() => {
    const current = snap ? buildTimeline(snap) : [];
    return mergeTimelines(current, buildArchiveTimeline(archiveMonths));
  }, [archiveMonths, snap]);
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
    const archivedStreams = archiveIndex.months.reduce((sum, month) => sum + month.streams, 0);
    const archivedMilestones = archiveIndex.months.reduce((sum, month) => sum + month.milestones, 0);
    const generatedDate = snap.generated_at.slice(0, 10);
    const futureMilestones = snap.milestones.filter((milestone) => milestone.date > generatedDate).length;
    return {
      ...loaded,
      recent: Math.max(loaded.recent, archivedStreams),
      milestone: Math.max(loaded.milestone, archivedMilestones + futureMilestones),
    };
  }, [archiveIndex, groupedTimeline, selectedGroup, snap]);
  const items = useMemo(
    () => filterTimeline(timeline, query, selectedChannelId, selectedKind, selectedGroup),
    [timeline, query, selectedChannelId, selectedKind, selectedGroup],
  );
  // Finished streams and milestones read newest-first; everything else reads forward from now.
  const railMode: RailMode = historyKind ? "history" : "forward";
  const historyTotal = useMemo(() => {
    if (!archiveIndex || !historyKind) return 0;
    return archiveIndex.months.reduce(
      (sum, month) => sum + (historyKind === "recent" ? month.streams : month.milestones),
      0,
    );
  }, [archiveIndex, historyKind]);
  const historyLoaded = useMemo(() => {
    if (!historyKind) return 0;
    return archiveMonths.reduce(
      (sum, month) => sum + (historyKind === "recent" ? month.streams.length : month.milestones.length),
      0,
    );
  }, [archiveMonths, historyKind]);

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
            <div className="mt-5">
              <Timeline
                items={items}
                nowMs={nowMs}
                mode={railMode}
                onShowFinished={() => setSelectedKind("recent")}
              />
              {historyKind && (
                <div className="mt-5 flex flex-col items-center gap-2 text-center text-xs text-text-secondary" aria-live="polite">
                  {!archiveIndex && !archiveError && <span>正在讀取永久封存…</span>}
                  {archiveIndex && historyTotal > 0 && (
                    <span>
                      已載入 {Math.min(historyLoaded, historyTotal).toLocaleString()} / {historyTotal.toLocaleString()} 筆歷史封存
                    </span>
                  )}
                  {nextArchive && (
                    <button
                      type="button"
                      onClick={() => void loadNextArchiveMonth()}
                      disabled={archiveLoading}
                      className="glass rounded-pill px-4 py-2 text-sm font-semibold text-text-primary disabled:cursor-wait disabled:opacity-60"
                    >
                      {archiveLoading ? "載入封存中…" : archiveError ? "重試載入封存" : "載入更早紀錄"}
                    </button>
                  )}
                  {archiveError && !nextArchive && (
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
                  {archiveIndex && historyTotal > 0 && !nextArchive && historyLoaded >= historyTotal && (
                    <span>已載入全部永久紀錄。</span>
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
