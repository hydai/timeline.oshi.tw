"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Copying a share link, wherever its button lives. The confirmation and the manual
 * fallback float at the bottom of the screen, so they read the same for every button;
 * a new `resetKey` (the links changed) clears both.
 */
export function useShareLink(resetKey: string) {
  const [message, setMessage] = useState("");
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A clipboard write can stay pending (a permission prompt, a slow browser). Only the
  // newest request, made for the links still on screen, may report its outcome.
  const latestRequest = useRef(0);
  const manualInput = useRef<HTMLInputElement>(null);
  // Where focus was when the link was asked for. The fallback may take focus only from
  // there: by the time a late failure lands, the reader may be in the VTuber picker, and
  // pulling focus out of that modal would strand it behind the backdrop.
  const askedFrom = useRef<Element | null>(null);

  useEffect(() => {
    if (manualUrl && document.activeElement === askedFrom.current) manualInput.current?.focus();
  }, [manualUrl]);

  useEffect(() => {
    latestRequest.current += 1;
    setMessage("");
    setManualUrl(null);
    return () => {
      if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    };
  }, [resetKey]);

  const copy = async (path: string) => {
    const request = ++latestRequest.current;
    askedFrom.current = document.activeElement;
    const url = new URL(path, window.location.origin).href;
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    setMessage("");
    setManualUrl(null);
    try {
      await navigator.clipboard.writeText(url);
      if (request !== latestRequest.current) return;
      setMessage("已複製分享連結");
      messageTimer.current = setTimeout(() => setMessage(""), 3000);
    } catch {
      if (request !== latestRequest.current) return;
      setMessage("請手動複製分享連結");
      setManualUrl(url);
    }
  };

  const dismiss = () => {
    setMessage("");
    setManualUrl(null);
  };

  // Above the rail but below the command bar (z-30), so the VTuber picker's sheet and its
  // backdrop cover a lingering link card instead of leaving it on top of the modal.
  const feedback: ReactNode = (
    <div className="pointer-events-none fixed inset-x-4 bottom-6 z-20 flex flex-col items-center gap-2">
      <div role="status" aria-atomic="true" className="flex max-w-full justify-center">
        {message && (
          <span className="max-w-full rounded-pill border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-center text-sm text-text-primary shadow-lg">
            {message}
          </span>
        )}
      </div>
      {manualUrl && (
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-lg">
          <input
            ref={manualInput}
            aria-label="分享連結"
            readOnly
            value={manualUrl}
            onFocus={(event) => event.target.select()}
            className="min-w-0 flex-1 rounded-xl bg-[var(--bg-surface-muted)] px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="button"
            aria-label="關閉分享連結"
            onClick={dismiss}
            className="grid h-9 w-9 flex-none place-items-center rounded-xl text-text-secondary hover:bg-[var(--bg-popover-hover)] hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <X size={16} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );

  return { copy, feedback };
}
