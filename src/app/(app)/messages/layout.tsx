import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/server";
import { listConversations } from "@/lib/db/conversations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MessagesDesktopFrame } from "@/components/messages";

/**
 * Shared shell for `/messages`, `/messages/[id]` and `/messages/new`
 * (`DESIGN_V3_DESKTOP.md`'s brief: "thread list left (320px [...]), thread
 * right"). Fetches the conversation list once — via `getCurrentUser`, the
 * non-redirecting, request-memoized read, not `requireUser` — so a signed-out
 * visit still redirects from whichever page they actually landed on (each
 * page below keeps its own `requireUser(...)` call with the right
 * post-login destination) rather than being bounced to the bare `/messages`
 * URL by this layout running first.
 *
 * `MessagesDesktopFrame` renders that list as a real 320px sidebar at
 * `>= 1024px` and passes `children` through unchanged below that width — the
 * mobile product is untouched.
 */
export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    return <>{children}</>;
  }

  const supabase = await createServerSupabaseClient();
  let initialItems: Awaited<ReturnType<typeof listConversations>>["items"] = [];
  let initialCursor: string | null = null;
  let initialError: string | null = null;
  try {
    const page = await listConversations(supabase, user.id, { limit: 20 });
    initialItems = page.items;
    initialCursor = page.nextCursor;
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Something went wrong.";
  }

  return (
    <MessagesDesktopFrame
      viewerId={user.id}
      initialItems={initialItems}
      initialCursor={initialCursor}
      initialError={initialError}
    >
      {children}
    </MessagesDesktopFrame>
  );
}
