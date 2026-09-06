"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { loadMoreNotifications, markAllNotificationsRead } from "@/app/(app)/notifications/actions";
import { Button, EmptyState } from "@/components/ui";
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
  const t = useTranslations("NotificationsView");
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
        setLoadMoreError(result.error ?? t("couldNotLoadMore"));
      }
    });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sticky under the (mobile or desktop) top bar — both are the same
          56px height, so one `top-top-bar` offset covers every width
          without a breakpoint override. A static screenshot at scroll
          position 0 looks identical to the old, non-sticky header; only
          scrolled behaviour changes. */}
      <div className="sticky top-top-bar z-10 flex items-center justify-between bg-paper px-4 py-2 sm:px-5">
        <p className="text-xs text-fg-subtle" aria-live="polite">
          {unreadCount > 0 ? t("unreadCount", { count: unreadCount }) : t("allCaughtUp")}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleMarkAll}
          loading={isMarkingAll}
          disabled={isMarkingAll || unreadCount === 0}
        >
          {t("markAllAsRead")}
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
            {t("loadMore")}
          </Button>
        ) : (
          <p className="text-xs text-fg-subtle">{t("allCaughtUpFull")}</p>
        )}
      </div>
    </div>
  );
}
