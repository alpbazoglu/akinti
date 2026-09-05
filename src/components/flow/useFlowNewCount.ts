"use client";

import { useEffect, useState } from "react";

import { getFlowNewCount } from "@/app/(app)/flow/actions";

/**
 * The Flow nav item's "new for you" count (`docs/FLOW.md` "Retention
 * hooks"). One fetch on mount — Flow's ranking changes with every follow,
 * publish and challenge entry, so unlike `useUnreadMessages` there is no
 * single realtime channel to key a live subscription off; a fresh count on
 * every nav mount (each route change re-mounts the shell's nav) is the
 * honest, simple version of this rather than a fabricated live count.
 * `0` (never shown — the caller checks `count > 0`, `CountBadge` already
 * renders nothing at `0`) when signed out.
 */
export function useFlowNewCount(userId: string | null): number {
  const [fetched, setFetched] = useState<{ userId: string; count: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getFlowNewCount().then((count) => {
      if (!cancelled) setFetched({ userId, count });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return userId && fetched?.userId === userId ? fetched.count : 0;
}
