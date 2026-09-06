
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listCommentedWaves } from "@/lib/db/comments";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadCommentedWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("CommentedContentPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Content → Commented (spec §14, §25): every Wave the viewer has left a comment on, most recent first. */
export default async function CommentedContentPage() {
  const user = await requireUser(routes.settingsContentCommented());
  const t = await getTranslations("CommentedContentPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listCommentedWaves(db, user.id));

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadCommentedWaves}
          emptyTitle={t("emptyTitle")}
          emptyDescription={t("emptyDescription")}
        />
      </div>
    </>
  );
}
