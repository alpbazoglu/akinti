"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { loadMoreConversations } from "@/app/(app)/messages/actions";
import type { ConversationSummary } from "@/types/domain";

/**
 * The `/messages` conversation list, lifted out of `MessagesView` into a
 * context provider so it can be fetched and paginated exactly once per
 * request (`docs/design/SCREENS.md`'s "genuinely mounted once per breakpoint"
 * bar, the same one `WaveCreatorCard`/`OwnerInsights` meet on the Wave page).
 *
 * `src/app/(app)/messages/layout.tsx` fetches the first page server-side and
 * mounts `ConversationListProvider` once above every route under
 * `/messages`; both the mobile full-list `MessagesView` and the desktop
 * `ConversationListPane` (>= 1024px sidebar) read the same instance instead
 * of each holding — and re-fetching — their own copy.
 */

export interface ConversationListState {
  viewerId: string;
  items: ConversationSummary[];
  cursor: string | null;
  query: string;
  setQuery: (query: string) => void;
  filtered: ConversationSummary[];
  loadMore: () => void;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  /** Set when `layout.tsx`'s initial server fetch failed; `items` is `[]` in that case, not a genuinely empty inbox. */
  loadError: string | null;
}

const ConversationListContext = createContext<ConversationListState | null>(null);

export function matchesConversationQuery(
  summary: ConversationSummary,
  viewerId: string,
  query: string,
): boolean {
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

export interface ConversationListProviderProps {
  viewerId: string;
  initialItems: ConversationSummary[];
  initialCursor: string | null;
  /** Passed through when `layout.tsx`'s server-side fetch threw, so the list surfaces a real error instead of looking like an empty inbox. */
  initialError?: string | null;
  children: ReactNode;
}

export function ConversationListProvider({
  viewerId,
  initialItems,
  initialCursor,
  initialError = null,
  children,
}: ConversationListProviderProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isLoadingMore, startLoadingMore] = useTransition();

  const filtered = useMemo(
    () => items.filter((summary) => matchesConversationQuery(summary, viewerId, query.trim())),
    [items, viewerId, query],
  );

  const loadMore = useCallback(() => {
    if (!cursor) return;
    setLoadMoreError(null);
    startLoadingMore(async () => {
      const result = await loadMoreConversations(cursor);
      if (result.ok && result.data) {
        setItems((current) => [...current, ...result.data!.items]);
        setCursor(result.data.nextCursor);
      } else {
        setLoadMoreError(result.error ?? null);
      }
    });
  }, [cursor]);

  const value = useMemo<ConversationListState>(
    () => ({
      viewerId,
      items,
      cursor,
      query,
      setQuery,
      filtered,
      loadMore,
      isLoadingMore,
      loadMoreError,
      loadError: initialError,
    }),
    [viewerId, items, cursor, query, filtered, loadMore, isLoadingMore, loadMoreError, initialError],
  );

  return <ConversationListContext.Provider value={value}>{children}</ConversationListContext.Provider>;
}

/** Only ever missing if a route under `/messages` renders outside its `layout.tsx` — a wiring bug, not a runtime state to design around. */
export function useConversationList(): ConversationListState {
  const context = useContext(ConversationListContext);
  if (!context) {
    throw new Error("useConversationList must be used within ConversationListProvider");
  }
  return context;
}
