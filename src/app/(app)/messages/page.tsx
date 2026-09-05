import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { listConversations } from "@/lib/db/conversations";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout";
import { ErrorState } from "@/components/ui";
import { MessagesView } from "@/components/messages";
import type { ConversationSummary, Page } from "@/types/domain";

export const metadata = { title: TERMS.messages };

/** `/messages`: the conversation inbox (spec §22 deliverable 1). */
export default async function MessagesPage() {
  const user = await requireUser(routes.messages());
  const supabase = await createServerSupabaseClient();

  let initial: Page<ConversationSummary> | null = null;
  let loadError: string | null = null;
  try {
    initial = await listConversations(supabase, user.id, { limit: 20 });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Something went wrong.";
  }

  return (
    <>
      <PageHeader
        title={TERMS.messages}
      />
      {loadError || !initial ? (
        <ErrorState description={loadError ?? "We could not load your messages right now."} />
      ) : (
        <MessagesView
          viewerId={user.id}
          initialItems={initial.items}
          initialCursor={initial.nextCursor}
        />
      )}
    </>
  );
}
