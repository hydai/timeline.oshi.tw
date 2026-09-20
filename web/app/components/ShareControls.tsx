"use client";

import { useEffect, useRef, useState } from "react";
import { Link as LinkIcon, Share2 } from "lucide-react";

export default function ShareControls({ href, channelHref }: { href: string; channelHref: string | null }) {
  const [message, setMessage] = useState("");
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMessage("");
    setManualUrl(null);
    return () => {
      if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    };
  }, [href, channelHref]);

  const copy = async (path: string) => {
    const url = new URL(path, window.location.origin).href;
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    setMessage("");
    setManualUrl(null);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("已複製分享連結");
      messageTimer.current = setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("請手動複製分享連結");
      setManualUrl(url);
    }
  };

  const button = "inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-[var(--bg-surface-muted)] px-3 text-xs font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink";
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={button} onClick={() => void copy(href)}>
          <Share2 size={14} aria-hidden />分享目前篩選
        </button>
        {channelHref && (
          <button type="button" className={button} onClick={() => void copy(channelHref)}>
            <LinkIcon size={14} aria-hidden />分享這位 VTuber
          </button>
        )}
      </div>
      <div role="status" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-6 z-[60] flex justify-center">
        {message && (
          <span className="max-w-full rounded-pill border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-center text-sm text-text-primary shadow-lg">
            {message}
          </span>
        )}
      </div>
      {manualUrl && (
        <input
          aria-label="分享連結" readOnly value={manualUrl}
          onFocus={(event) => event.target.select()}
          className="mt-2 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-muted)] px-3 py-2 text-sm text-text-primary"
        />
      )}
    </div>
  );
}
