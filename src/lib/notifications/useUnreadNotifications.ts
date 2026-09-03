"use client";

import { useEffect, useRef, useState } from "react";

import { markAllReadLocally, markOneReadLocally, subscribeUnread } from "./unreadStore";

export interface UseUnreadNotificationsResult {
  /** Live unread count for the current user, `0` when signed out. */
  count: number;
  /** Call after "Mark all as read" succeeds server-side. */
  markAllRead: () => void;
  /** Call after a single notification is marked read. */
  markOneRead: () => void;
}

/**
 * Live unread-notification count for `userId`, seeded from `initialCount`
 * (the server-rendered value) and kept in sync via a shared Realtime
 * subscription with a polling fallback (`unreadStore.ts`). Safe to call from
 * multiple components at once — `TopBar`, `SideNav` and `BottomNav` each call
 * this independently and share one underlying subscription per user.
 */
export function useUnreadNotifications(
  userId: string | null,
  initialCount = 0,
): UseUnreadNotificationsResult {
  const [count, setCount] = useState(() => Math.max(0, initialCount));
  // Only the value at the first subscription matters (it seeds the shared
  // store) — captured once via the lazy `useRef` initializer so later
  // re-renders passing a different `initialCount` don't affect it, and so
  // this never writes to the ref during render.
  const initialCountRef = useRef(initialCount);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeUnread(userId, initialCountRef.current, setCount);
  }, [userId]);

  return {
    // No signed-in user: no subscription is active, so read as zero rather
    // than trusting a stale `count` from a previous user id.
    count: userId ? count : 0,
    markAllRead: () => {
      if (userId) markAllReadLocally(userId);
    },
    markOneRead: () => {
      if (userId) markOneReadLocally(userId);
    },
  };
}
