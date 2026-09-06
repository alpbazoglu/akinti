import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickMessages } from "@/i18n/pickMessages";

/**
 * Per-route-group message narrowing (closeout perf pass), Explore's slice —
 * see `flow/layout.tsx` for the full rationale and the same caveats
 * (self-sufficient list, AppShell chrome unaffected). Namespaces verified by
 * walking the real import graph from `page.tsx`/`actions.ts`/`signatures.ts`,
 * including through the feed's Wave cards (`WaveCardContainer`'s own
 * dynamically-imported `ShareSheet`).
 */
const EXPLORE_MESSAGE_NAMESPACES = [
  "Terms",
  "Common",
  "ExplorePage",
  "ExploreView",
  "BackingTracksLane",
  "OpenCallsLane",
  "RisingCreatorsStrip",
  "TraceRow",
  "WaveFeedList",
  "WaveCard",
  "WaveCardContainer",
  "WavePlayer",
  "ShareSheet",
  "Sheet",
  "ProMark",
  "ProfileActions",
  "MessagesActions",
  "ErrorPage",
  "NotFoundPage",
] as const;

export default async function ExploreLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, EXPLORE_MESSAGE_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
