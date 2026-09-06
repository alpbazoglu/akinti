
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listProfileWaves } from "@/lib/db/waves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadMyWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("MyWavesContentPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Content → Waves (spec §25): every Wave the viewer has published, newest first. */
export default async function MyWavesContentPage() {
  const user = await requireUser(routes.settingsContentWaves());
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("MyWavesContentPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("waves")} />
        <EmptyState title={tPage("backendNotConfiguredTitle")} description={tPage("backendNotConfiguredDescription")} />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listProfileWaves(db, user.id));

  return (
    <>
      <PageHeader title={t("waves")} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadMyWaves}
          emptyTitle={tPage("emptyTitle")}
          emptyDescription={tPage("emptyDescription")}
        />
      </div>
    </>
  );
}
