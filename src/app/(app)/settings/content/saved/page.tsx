
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listSavedWaves } from "@/lib/db/saves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadSavedWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("SavedContentPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Content → Saved (spec §14, §25): every Wave the viewer has saved, newest first. */
export default async function SavedContentPage() {
  const user = await requireUser(routes.settingsContentSaved());
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("SavedContentPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={tPage("title")} />
        <EmptyState title={tPage("backendNotConfiguredTitle")} description={tPage("backendNotConfiguredDescription")} />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listSavedWaves(db, user.id));

  return (
    <>
      <PageHeader title={tPage("title")} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadSavedWaves}
          emptyTitle={tPage("emptyTitle")}
          emptyDescription={tPage("emptyDescription", { save: t("save"), wave: t("wave") })}
        />
      </div>
    </>
  );
}
