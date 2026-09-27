"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Disclosure state for the command-bar popovers. Dismissed by an outside pointer
 * press or Escape, so a stray click never leaves a panel stranded over the rail.
 *
 * While `sheetMedia` matches, the panel is a bottom sheet laid out by CSS alone, and
 * the page behind it stops scrolling.
 */
export function usePopover<T extends HTMLElement>({ maxHeight = 360, sheetMedia = "" } = {}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isSheet = useCallback(
    () => sheetMedia !== "" && typeof window.matchMedia === "function" && window.matchMedia(sheetMedia).matches,
    [sheetMedia],
  );
  // Subscribed, not just read at render: rotating a phone or resizing a window flips the
  // CSS layout at once, and the modal behaviour below has to flip with it.
  const subscribeToSheet = useCallback((onChange: () => void) => {
    if (sheetMedia === "" || typeof window.matchMedia !== "function") return () => {};
    const query = window.matchMedia(sheetMedia);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [sheetMedia]);
  const sheet = useSyncExternalStore(subscribeToSheet, isSheet, () => false) && open;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const positionPanel = () => {
      const anchor = ref.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      if (isSheet()) {
        panel.style.left = "";
        panel.style.maxHeight = "";
        return;
      }

      const gutter = 16;
      const anchorBounds = anchor.getBoundingClientRect();
      const panelWidth = panel.getBoundingClientRect().width;
      const viewportWidth = document.documentElement.clientWidth;
      const left = Math.max(gutter, Math.min(anchorBounds.left, viewportWidth - panelWidth - gutter));
      const availableHeight = window.innerHeight - anchorBounds.bottom - 8 - gutter;
      panel.style.left = `${left - anchorBounds.left}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(maxHeight, availableHeight))}px`;
    };

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, maxHeight, isSheet]);

  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [sheet]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape during an IME composition cancels the composition, not the panel. Safari
      // reports the key that ends a composition as keyCode 229 rather than isComposing.
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return { open, setOpen, close, sheet, ref, panelRef, triggerRef };
}
