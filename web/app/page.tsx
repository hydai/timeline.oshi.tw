"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchSnapshot } from "@/lib/snapshot";
import { buildTimeline } from "@/lib/timeline";
import { filterTimeline } from "@/lib/filter";
import type { Snapshot } from "@/lib/types";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import GroupFilter from "./components/GroupFilter";
import Timeline from "./components/Timeline";

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "/streams-sample.json";

export default function Home() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchSnapshot(SNAPSHOT_URL).then((s) => { if (alive) setSnap(s); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const nowMs = useMemo(() => Date.now(), [snap]);
  const items = useMemo(() => (snap ? filterTimeline(buildTimeline(snap), query, groups) : []), [snap, query, groups]);

  function toggleGroup(g: string) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-2xl px-4 py-6">
      <div className="pointer-events-none absolute -top-20 -right-20 h-96 w-96 rounded-full bg-pink-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute top-40 -left-20 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" aria-hidden />
      <div className="relative z-10">
        <Header updatedAt={snap?.generated_at ?? ""} />
        {error ? (
          <div className="glass rounded-2xl p-6 text-center text-text-secondary">載入失敗，請稍後再試。</div>
        ) : !snap ? (
          <div className="glass rounded-2xl p-6 text-center text-text-secondary">載入中…</div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3">
              <SearchBar value={query} onChange={setQuery} />
              <GroupFilter groups={snap.groups} selected={groups} onToggle={toggleGroup} />
            </div>
            <Timeline items={items} nowMs={nowMs} />
          </>
        )}
      </div>
    </div>
  );
}
