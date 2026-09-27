"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Link as LinkIcon, Share2, SlidersHorizontal } from "lucide-react";
import { usePopover } from "./usePopover";

const BUTTON = [
  "grid h-11 w-11 place-items-center rounded-2xl bg-[var(--bg-surface-muted)] text-text-secondary transition-colors",
  "hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-pink",
].join(" ");

/**
 * The page's one way to share. With nothing but the current view to share it copies that
 * at once; on a VTuber's page it asks which link: the VTuber's own page, which always
 * shows their latest, or exactly the view on screen, type and month included.
 */
export default function ShareButton({ viewHref, channelHref, onShare }: {
  viewHref: string;
  channelHref: string | null;
  onShare: (href: string) => void;
}) {
  const { open, setOpen, close, ref, panelRef, triggerRef } = usePopover<HTMLDivElement>({ maxHeight: 240, align: "end" });
  const firstItem = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (open) firstItem.current?.focus();
  }, [open]);

  if (!channelHref) {
    return (
      <button type="button" aria-label="分享目前篩選" title="分享目前篩選" onClick={() => onShare(viewHref)} className={BUTTON}>
        <Share2 size={17} strokeWidth={2.2} aria-hidden />
      </button>
    );
  }

  // Focus goes back to the trigger first: if copying fails, the fallback link takes focus
  // only from wherever it was asked for, and the item it was asked from is about to go.
  const choose = (href: string) => {
    close(true);
    onShare(href);
  };

  // Arrow keys walk the two items, as in any menu; Tab leaves it, and it closes behind you.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  const item = "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-popover-hover)] focus-visible:bg-[var(--bg-popover-hover)] focus-visible:outline-hidden";
  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="分享"
        title="分享"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={BUTTON}
      >
        <Share2 size={17} strokeWidth={2.2} aria-hidden />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="分享"
          onKeyDown={onMenuKeyDown}
          className="menu-panel popover-surface absolute top-[calc(100%+8px)] z-50 w-[272px] rounded-2xl p-1.5"
        >
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            aria-labelledby={`${id}-channel`}
            aria-describedby={`${id}-channel-note`}
            onClick={() => choose(channelHref)}
            className={item}
          >
            <LinkIcon size={16} strokeWidth={2.2} className="mt-0.5 flex-none text-[var(--text-accent-pink)]" aria-hidden />
            <span className="min-w-0">
              <span id={`${id}-channel`} className="block text-[13.5px] font-bold text-text-primary">分享這位 VTuber</span>
              <span id={`${id}-channel-note`} className="block text-xs text-text-secondary">頻道頁，打開時永遠是最新動態</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            aria-labelledby={`${id}-view`}
            aria-describedby={`${id}-view-note`}
            onClick={() => choose(viewHref)}
            className={item}
          >
            <SlidersHorizontal size={16} strokeWidth={2.2} className="mt-0.5 flex-none text-text-secondary" aria-hidden />
            <span className="min-w-0">
              <span id={`${id}-view`} className="block text-[13.5px] font-bold text-text-primary">分享目前篩選</span>
              <span id={`${id}-view-note`} className="block text-xs text-text-secondary">連同目前的類型與月份</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
