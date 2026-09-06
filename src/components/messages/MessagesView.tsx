"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "@/components/ui/icons";

import { Button, EmptyState, ErrorState, Input } from "@/components/ui";
import { useIsDesktopViewport } from "@/lib/ui";

import { ConversationRow } from "./ConversationRow";
import { useConversationList } from "./ConversationListContext";
import { MessagesEmptyPane } from "./MessagesEmptyPane";

/**
 * Client half of `/messages`: the conversation list, name search/filter over
 * what's loaded, and "Load more" cursor pagination (spec §22 deliverable 1).
 *
 * At >= 1024px the list itself already lives in `ConversationListPane`
 * (`MessagesDesktopFrame`'s left sidebar, mounted once above every route
 * under `/messages`) — this component's job on the bare `/messages` route at
 * that width is only to fill the right pane with an invitation to pick a
 * thread, exactly the branch `FlowScreen`/`ExploreView` take on
 * `useIsDesktopViewport()`.
 */
export function MessagesView() {
  const t = useTranslations("MessagesView");
  const router = useRouter();
  const isDesktop = useIsDesktopViewport();
  const { viewerId, items, query, setQuery, filtered, cursor, loadMore, isLoadingMore, loadMoreError, loadError } =
    useConversationList();

  if (loadError) {
    return <ErrorState description={loadError} onRetry={() => router.refresh()} />;
  }

  if (isDesktop) {
    return <MessagesEmptyPane />;
  }

  if (items.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
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
            <Button variant="secondary" size="sm" onClick={loadMore} loading={isLoadingMore}>
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
