"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Disclosure state for the command-bar popovers. Dismissed by an outside pointer
 * press or Escape, so a stray click never leaves a panel stranded over the rail.
 */
export function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const positionPanel = () => {
      const anchor = ref.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const gutter = 16;
      const anchorBounds = anchor.getBoundingClientRect();
      const panelWidth = panel.getBoundingClientRect().width;
      const viewportWidth = document.documentElement.clientWidth;
      const left = Math.max(gutter, Math.min(anchorBounds.left, viewportWidth - panelWidth - gutter));
      const availableHeight = window.innerHeight - anchorBounds.bottom - 8 - gutter;
      panel.style.left = `${left - anchorBounds.left}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(360, availableHeight))}px`;
    };

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref, panelRef };
}
