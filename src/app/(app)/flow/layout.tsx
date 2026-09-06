import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "@/i18n/pickMessages";

/**
 * Per-route-group message narrowing (closeout perf pass), Flow's slice.
 *
 * `(app)/layout.tsx` still ships the full messages set for every screen
 * under the shell that doesn't have its own nested provider — this is the
 * first of five carved out for the heaviest routes (Flow/Explore/Wave/
 * Create/Settings). A nested `NextIntlClientProvider` REPLACES, not merges
 * with, its ancestor's (`pickMessages`'s own doc comment, review3 finding
 * 12), so this list must be self-sufficient for everything `useTranslations`/
 * `getTranslations` under `/flow` actually calls — verified by walking the
 * real import graph from `page.tsx`/`actions.ts`/`hydrateFlow.ts` (including
 * through dynamic()-imported children like `FlowCommentSheet`'s own reuse of
 * the Wave-page comment components, and `ShareSheet`), not guessed. AppShell's
 * own chrome (`SideNav`/`TopBar`/`BottomNav`, the `Layout` namespace) renders
 * OUTSIDE where `{children}` lands here, so it stays covered by the ancestor
 * provider and does not need to be repeated in this list. `ErrorPage`/
 * `NotFoundPage` cover the per-segment error/not-found boundaries Next
 * attaches under this layout.
 */
const FLOW_MESSAGE_NAMESPACES = [
  "Terms",
  "Common",
  "Flow",
  "FlowWaveView",
  "CommentsSection",
  "CommentComposer",
  "CommentItem",
  "ReportCommentSheet",
  "ShareSheet",
  "Sheet",
  "MessagesActions",
  "ErrorPage",
  "NotFoundPage",
] as const;

export default async function FlowLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, FLOW_MESSAGE_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
