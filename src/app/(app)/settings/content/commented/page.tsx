import { MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listCommentedWaves } from "@/lib/db/comments";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadCommentedWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export const metadata = { title: `Commented · ${TERMS.settings}` };

/** Settings → Content → Commented (spec §14, §25): every Wave the viewer has left a comment on, most recent first. */
export default async function CommentedContentPage() {
  const user = await requireUser(routes.settingsContentCommented());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Commented" />
        <EmptyState title="Backend not configured" description="Commented Waves are unavailable in this environment." />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listCommentedWaves(db, user.id));

  return (
    <>
      <PageHeader title="Commented" description={`${TERMS.waves} you've left a ${TERMS.comment.toLowerCase()} on.`} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadCommentedWaves}
          emptyIcon={<MessageSquare className="size-5" />}
          emptyTitle="No comments yet"
          emptyDescription={`Waves you comment on will show up here.`}
        />
      </div>
    </>
  );
}
