"use client";

import { useEffect, useRef, useState } from "react";

import { refreshUnreadMessages, subscribeUnreadMessages } from "./unreadStore";

export interface UseUnreadMessagesResult {
  /** Live unread-messages count for the current user, `0` when signed out. */
  count: number;
  /** Force an immediate resync — call right after `markConversationRead` succeeds. */
  refresh: () => void;
}

/**
 * Live unread-messages count for `userId`, seeded from `initialCount` (the
 * server-rendered value) and kept in sync via a shared Realtime subscription
 * with a polling fallback (`unreadStore.ts`). Mirrors
 * `useUnreadNotifications` — `TopBar` and `SideNav` each call this
 * independently and share one underlying subscription per user.
 */
export function useUnreadMessages(userId: string | null, initialCount = 0): UseUnreadMessagesResult {
  const [count, setCount] = useState(() => Math.max(0, initialCount));
  // Only the value at the first subscription matters (it seeds the shared
  // store) — captured once via the lazy `useRef` initializer so later
  // re-renders passing a different `initialCount` don't affect it.
  const initialCountRef = useRef(initialCount);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeUnreadMessages(userId, initialCountRef.current, setCount);
  }, [userId]);

  return {
    count: userId ? count : 0,
    refresh: () => {
      if (userId) refreshUnreadMessages(userId);
    },
  };
}
