"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Search } from "@/components/ui/icons";
import { Button, Input } from "@/components/ui";
import { routes } from "@/config/routes";

import { ConversationRow } from "./ConversationRow";
import { useConversationList } from "./ConversationListContext";

/**
 * The desktop (`>= 1024px`) left sidebar for every route under `/messages`
 * (`DESIGN_V3_DESKTOP.md`'s brief: "thread list left (320px, search, unread
 * marks, hover)"). Reads the one `ConversationListProvider` instance
 * `MessagesDesktopFrame` mounts, so it never re-fetches what the mobile list
 * or the previous thread already loaded.
 */
export function ConversationListPane() {
  const t = useTranslations("MessagesView");
  const pathname = usePathname();
  const { viewerId, items, query, setQuery, filtered, cursor, loadMore, isLoadingMore, loadMoreError } =
    useConversationList();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-5 pt-6 pb-4">
        <h1 className="type-desktop-heading text-ink">{t("messagesTitle")}</h1>
      </div>

      <div className="px-4 pb-3">
        <Input
          id="messages-search-desktop"
          label={t("searchLabel")}
          hideLabel
          placeholder={t("searchPlaceholder")}
          leadingIcon={<Search className="size-4" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {items.length === 0 ? (
          <p className="type-body-sm px-5 py-4 text-ink-muted">{t("emptyDescription")}</p>
        ) : filtered.length === 0 ? (
          <p className="type-body-sm px-5 py-4 text-ink-muted">{t("noMatchesDescription")}</p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((summary) => (
              <li key={summary.conversation.id}>
                <ConversationRow
                  summary={summary}
                  viewerId={viewerId}
                  active={pathname === routes.conversation(summary.conversation.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {query.trim().length === 0 && items.length > 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 pt-2">
            {loadMoreError ? (
              <p role="alert" className="type-caption text-signal-deep">
                {loadMoreError}
              </p>
            ) : null}
            {cursor ? (
              <Button variant="secondary" size="sm" onClick={loadMore} loading={isLoadingMore}>
                {t("loadMore")}
              </Button>
            ) : (
              <p className="type-caption text-ink-subtle">{t("reachedStart")}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
