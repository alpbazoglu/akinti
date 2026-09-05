
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listProfileDuets } from "@/lib/db/waves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadMyDuets } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export const metadata = { title: `Duets · ${TERMS.settings}` };

/** Settings → Content → Duets (spec §25): every Duet the viewer has published, newest first. */
export default async function MyDuetsContentPage() {
  const user = await requireUser(routes.settingsContentDuets());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.duets} />
        <EmptyState title="Backend not configured" description="Your Duets are unavailable in this environment." />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listProfileDuets(db, user.id));

  return (
    <>
      <PageHeader title={TERMS.duets} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadMyDuets}
          emptyTitle={`No ${TERMS.duets.toLowerCase()} yet`}
          emptyDescription={`Duets you publish will show up here, credited back to the original ${TERMS.wave.toLowerCase()}.`}
        />
      </div>
    </>
  );
}
