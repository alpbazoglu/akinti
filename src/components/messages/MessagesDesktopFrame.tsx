"use client";

import type { ReactNode } from "react";

import { useIsDesktopViewport } from "@/lib/ui";

import { ConversationListPane } from "./ConversationListPane";
import { ConversationListProvider } from "./ConversationListContext";
import type { ConversationSummary } from "@/types/domain";

export interface MessagesDesktopFrameProps {
  viewerId: string;
  initialItems: ConversationSummary[];
  initialCursor: string | null;
  initialError?: string | null;
  children: ReactNode;
}

/**
 * Wraps every route under `/messages` in the one `ConversationListProvider`
 * instance (`src/app/(app)/messages/layout.tsx` fetches the first page and
 * hands it here), and at `>= 1024px` splits the shell into the 320px thread
 * list (`ConversationListPane`) plus the route's own content as the right
 * pane — `/messages` itself renders `MessagesEmptyPane` there via
 * `MessagesView`, `/messages/[id]` renders `ThreadView`, `/messages/new`
 * renders its own picker/empty states, unmodified.
 *
 * Below 1024px this renders `children` alone: the mobile product already IS
 * that list-or-thread single pane, unchanged.
 */
export function MessagesDesktopFrame({
  viewerId,
  initialItems,
  initialCursor,
  initialError = null,
  children,
}: MessagesDesktopFrameProps) {
  const isDesktop = useIsDesktopViewport();

  return (
    <ConversationListProvider
      viewerId={viewerId}
      initialItems={initialItems}
      initialCursor={initialCursor}
      initialError={initialError}
    >
      {isDesktop ? (
        <div className="flex h-[calc(100dvh-var(--akinti-top-bar-h)-var(--akinti-now-playing-h,5.5rem))] overflow-hidden rounded-card border border-hairline">
          <aside className="w-80 shrink-0 overflow-y-auto border-r border-hairline bg-elevation-0">
            <ConversationListPane />
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto bg-elevation-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </ConversationListProvider>
  );
}
