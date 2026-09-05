
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listSavedWaves } from "@/lib/db/saves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadSavedWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export const metadata = { title: `Saved · ${TERMS.settings}` };

/** Settings → Content → Saved (spec §14, §25): every Wave the viewer has saved, newest first. */
export default async function SavedContentPage() {
  const user = await requireUser(routes.settingsContentSaved());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Saved" />
        <EmptyState title="Backend not configured" description="Saved Waves are unavailable in this environment." />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listSavedWaves(db, user.id));

  return (
    <>
      <PageHeader title="Saved" />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadSavedWaves}
          emptyTitle="Nothing saved yet"
          emptyDescription={`Tap ${TERMS.save} on any ${TERMS.wave.toLowerCase()} to collect it here.`}
        />
      </div>
    </>
  );
}
