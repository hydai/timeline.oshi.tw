"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSnapshot } from "@/lib/snapshot";
import { buildTimeline } from "@/lib/timeline";
import { buildVTuberFilterOptions, filterTimeline } from "@/lib/filter";
import type { Snapshot } from "@/lib/types";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import VTuberFilter from "./components/VTuberFilter";
import Timeline from "./components/Timeline";

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "https://data.oshi.tw/streams/v1/snapshot.json";

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);

  const load = useCallback(() => {
    setError(false);
    fetchSnapshot(SNAPSHOT_URL)
      .then((s) => { if (mounted.current) setSnap(s); })
      .catch(() => { if (mounted.current) setError(true); });
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

  const timeline = useMemo(() => (snap ? buildTimeline(snap) : []), [snap]);
  const vtubers = useMemo(() => buildVTuberFilterOptions(timeline), [timeline]);
  const items = useMemo(
    () => filterTimeline(timeline, query, selectedChannelId),
    [timeline, query, selectedChannelId],
  );

  return (
    <div className="relative mx-auto min-h-screen max-w-2xl px-4 py-6">
      <div className="pointer-events-none absolute -top-20 -right-20 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute top-40 -left-20 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" aria-hidden />
      <div className="relative z-10">
        <Header updatedAt={snap?.generated_at ?? ""} nowMs={nowMs} />
        {!snap && error ? (
          <div role="status" aria-live="polite" className="glass rounded-2xl p-6 text-center text-text-secondary">
            <p>載入失敗，請稍後再試。</p>
            <button type="button" onClick={load} className="glass mt-3 rounded-pill px-4 py-1 text-sm text-text-secondary">重試</button>
          </div>
        ) : !snap ? (
          <div role="status" aria-live="polite" className="glass rounded-2xl p-6 text-center text-text-secondary">載入中…</div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3">
              <SearchBar value={query} onChange={setQuery} />
              <VTuberFilter
                options={vtubers}
                selected={selectedChannelId}
                totalCount={timeline.length}
                onSelect={setSelectedChannelId}
              />
            </div>
            <Timeline items={items} nowMs={nowMs} />
          </>
        )}
      </div>
    </div>
  );
}
