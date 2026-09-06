"use client";

import { useSyncExternalStore } from "react";

/**
 * Flow's own `lg` (>= 1024px) breakpoint check (`DESIGN_V3_DESKTOP.md`:
 * desktop Flow trades the mobile full-screen swipe carousel for the "Akış"
 * stage-plus-rail layout; mobile keeps the carousel unchanged). A real
 * `matchMedia` listener rather than a resize-driven `useState` + effect, so
 * there is exactly one subscription per mounted consumer and no render
 * cascade on mount. SSR and the first client render both report `false`
 * (matching the mobile-first markup already in the DOM) — the desktop
 * layout swaps in the instant hydration can read `window`, same pattern as
 * `DesktopSideNav.tsx`'s `useCollapsed`.
 */
const QUERY = "(min-width: 1024px)";

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktopFlow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
