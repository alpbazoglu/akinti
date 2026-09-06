"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Search } from "@/components/ui/icons";

import { loadMoreConversations } from "@/app/(app)/messages/actions";
import { Button, EmptyState, Input } from "@/components/ui";
import type { ConversationSummary } from "@/types/domain";

import { ConversationRow } from "./ConversationRow";

export interface MessagesViewProps {
  viewerId: string;
  initialItems: ConversationSummary[];
  initialCursor: string | null;
}

function matchesQuery(summary: ConversationSummary, viewerId: string, query: string): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return summary.members.some((member) => {
    if (member.id === viewerId) return false;
    return (
      member.username.toLowerCase().includes(needle) ||
      (member.displayName ?? "").toLowerCase().includes(needle)
    );
  });
}

/**
 * Client half of `/messages`: the conversation list, name search/filter over
 * what's loaded, and "Load more" cursor pagination (spec §22 deliverable 1).
 */
export function MessagesView({ viewerId, initialItems, initialCursor }: MessagesViewProps) {
  const t = useTranslations("MessagesView");
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, startLoadingMore] = useTransition();

  const filtered = useMemo(
    () => items.filter((summary) => matchesQuery(summary, viewerId, query.trim())),
    [items, viewerId, query],
  );

  const handleLoadMore = () => {
    if (!cursor) return;
    setLoadMoreError(null);
    startLoadingMore(async () => {
      const result = await loadMoreConversations(cursor);
      if (result.ok && result.data) {
        setItems((current) => [...current, ...result.data!.items]);
        setCursor(result.data.nextCursor);
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
      <div className="px-4 pb-2 sm:px-5">
        <Input
          id="messages-search"
          label={t("searchLabel")}
          hideLabel
          placeholder={t("searchPlaceholder")}
          leadingIcon={<Search className="size-4" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState size="sm" title={t("noMatchesTitle")} description={t("noMatchesDescription")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((summary) => (
            <li key={summary.conversation.id}>
              <ConversationRow summary={summary} viewerId={viewerId} />
            </li>
          ))}
        </ul>
      )}

      {query.trim().length === 0 ? (
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
            <p className="text-xs text-fg-subtle">{t("reachedStart")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
