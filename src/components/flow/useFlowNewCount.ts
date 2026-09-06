"use client";

import { useEffect, useState } from "react";

import { getFlowNewCount } from "@/app/(app)/flow/actions";

/**
 * Module-level cache, keyed by `userId`: `count_flow_new()` scans `waves`
 * with three correlated subqueries (review3 finding 13) — bounded to a
 * LIMIT-100/7-day window at the database layer now, but the shell's nav
 * remounts on every route change, so fetching on every mount still meant
 * one of these queries per navigation for a purely decorative number. One
 * fetch per session (cleared only by a full page reload) is the honest,
 * simple fix rather than a live subscription this count has no single
 * realtime channel to key off of anyway.
 */
let sessionCache: { userId: string; count: number } | null = null;
let sessionCachePromise: Promise<void> | null = null;

/**
 * The Flow nav item's "new for you" count (`docs/FLOW.md` "Retention
 * hooks"). `0` (never shown — the caller checks `count > 0`, `CountBadge`
 * already renders nothing at `0`) when signed out.
 */
export function useFlowNewCount(userId: string | null): number {
  const [fetched, setFetched] = useState<{ userId: string; count: number } | null>(sessionCache);

  useEffect(() => {
    if (!userId) return;
    if (sessionCache?.userId === userId) {
      setFetched(sessionCache);
      return;
    }
    let cancelled = false;
    if (!sessionCachePromise) {
      sessionCachePromise = getFlowNewCount()
        .then((count) => {
          sessionCache = { userId, count };
        })
        .finally(() => {
          sessionCachePromise = null;
        });
    }
    void sessionCachePromise.then(() => {
      if (!cancelled && sessionCache) setFetched(sessionCache);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return userId && fetched?.userId === userId ? fetched.count : 0;
}
