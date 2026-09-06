"use client";

import { useSyncExternalStore } from "react";

/**
 * The desktop `lg` breakpoint (>= 1024px, `DESIGN_V3_DESKTOP.md`'s shell
 * floor) as a real `matchMedia` subscription rather than a resize-driven
 * `useState` + effect — one listener per consumer, no render cascade on
 * mount. SSR and the very first client render both report `false`, matching
 * the mobile-first markup already in the DOM; the desktop layout swaps in
 * the instant hydration can read `window` (same pattern as
 * `DesktopSideNav.tsx`'s `useCollapsed`).
 *
 * Screens that need genuinely different desktop composition (not just a
 * Tailwind `lg:` class toggle within the same markup) use this to pick one
 * render path instead of mounting both and hiding one with CSS — several
 * of this product's cards/rows carry their own analytics/audio hooks
 * (`usePlayTracker`, playback subscriptions), and a grid of a few dozen of
 * them is not a cost worth doubling just to let CSS do the switching.
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

export function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
