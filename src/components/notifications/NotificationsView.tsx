"use client";

import { useState, useTransition } from "react";

import { loadMoreNotifications, markAllNotificationsRead } from "@/app/(app)/notifications/actions";
import { Button, EmptyState } from "@/components/ui";
import { TERMS } from "@/config/terminology";
import { useUnreadNotifications } from "@/lib/notifications";
import type { NotificationWithActor } from "@/types/domain";

import { NotificationItem } from "./NotificationItem";

export interface NotificationsViewProps {
  userId: string;
  initialItems: NotificationWithActor[];
  initialCursor: string | null;
  initialUnreadCount: number;
}

/**
 * Client half of `/notifications`: owns the paginated list, "Mark all as
 * read", per-item mark-read, and the live unread count (`useUnreadNotifications`
 * — shared with the nav badges via `src/lib/notifications/unreadStore.ts`).
 */
export function NotificationsView({
  userId,
  initialItems,
  initialCursor,
  initialUnreadCount,
}: NotificationsViewProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [isMarkingAll, startMarkingAll] = useTransition();
  const { count: unreadCount, markAllRead, markOneRead } = useUnreadNotifications(
    userId,
    initialUnreadCount,
  );

  const handleRead = (id: string) => {
    setItems((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (item.id === id && item.readAt === null) {
          changed = true;
          return { ...item, readAt: new Date().toISOString() };
        }
        return item;
      });
      if (changed) {
        markOneRead();
      }
      return changed ? next : current;
    });
  };

  const handleMarkAll = () => {
    startMarkingAll(async () => {
      const result = await markAllNotificationsRead();
      if (result.ok) {
        const now = new Date().toISOString();
        setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
        markAllRead();
      }
    });
  };

  const handleLoadMore = () => {
    if (!cursor) return;
    setLoadMoreError(null);
    startLoadingMore(async () => {
      const result = await loadMoreNotifications(cursor);
      if (result.ok && result.data) {
        const page = result.data;
        setItems((current) => [...current, ...page.items]);
        setCursor(page.nextCursor);
      } else {
        setLoadMoreError(result.error ?? "Could not load more notifications.");
      }
    });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        title="No notifications yet"
        description={`When someone follows you, comments, ${TERMS.saves.toLowerCase()} or ${TERMS.shares.toLowerCase()} one of your ${TERMS.waves.toLowerCase()} — or asks you for a ${TERMS.duet} — you will hear about it here.`}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pb-2 sm:px-5">
        <p className="text-xs text-fg-subtle" aria-live="polite">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleMarkAll}
          loading={isMarkingAll}
          disabled={isMarkingAll || unreadCount === 0}
        >
          Mark all as read
        </Button>
      </div>

      <ul className="flex flex-col">
        {items.map((item) => (
          <NotificationItem key={item.id} notification={item} onRead={handleRead} />
        ))}
      </ul>

      <div className="flex flex-col items-center gap-2 px-4 py-4">
        {loadMoreError ? (
          <p role="alert" className="text-xs text-danger">
            {loadMoreError}
          </p>
        ) : null}
        {cursor ? (
          <Button variant="secondary" size="sm" onClick={handleLoadMore} loading={isLoadingMore}>
            Load more
          </Button>
        ) : (
          <p className="text-xs text-fg-subtle">You&apos;re all caught up.</p>
        )}
      </div>
    </div>
  );
}
