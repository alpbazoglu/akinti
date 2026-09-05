"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  RECENT_SEARCHES_KEY,
  parseRecentSearches,
  withRecentSearch,
  withoutRecentSearch,
  writeRecentSearches,
} from "./recentSearches";

/**
 * `localStorage` is an external system, so the search history is read through
 * `useSyncExternalStore` rather than copied into state by an effect. The
 * server snapshot is empty, which is the truth on the server: a per-device
 * history is not something it can know.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    // Another tab writing the same key.
    window.addEventListener("storage", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // A browser configured to block site data throws on access itself.
    return null;
  }
}

/** The raw stored string, so equal snapshots compare equal without a cache. */
function getSnapshot(): string {
  try {
    return storageOrNull()?.getItem(RECENT_SEARCHES_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): string {
  return "";
}

export interface RecentSearches {
  items: string[];
  remember: (query: string) => void;
  forget: (query: string) => void;
}

export function useRecentSearches(): RecentSearches {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const items = useMemo(() => parseRecentSearches(raw), [raw]);

  const remember = useCallback((query: string) => {
    writeRecentSearches(storageOrNull(), withRecentSearch(parseRecentSearches(getSnapshot()), query));
    emit();
  }, []);

  const forget = useCallback((query: string) => {
    writeRecentSearches(
      storageOrNull(),
      withoutRecentSearch(parseRecentSearches(getSnapshot()), query),
    );
    emit();
  }, []);

  return { items, remember, forget };
}
