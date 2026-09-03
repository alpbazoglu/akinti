import { AudioLines } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { hydrateContentWavePage } from "@/lib/interactions";
import { listProfileWaves } from "@/lib/db/waves";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { loadMyWaves } from "../actions";
import { ContentWaveList } from "../ContentWaveList";

export const metadata = { title: `Waves · ${TERMS.settings}` };

/** Settings → Content → Waves (spec §25): every Wave the viewer has published, newest first. */
export default async function MyWavesContentPage() {
  const user = await requireUser(routes.settingsContentWaves());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.waves} />
        <EmptyState title="Backend not configured" description="Your Waves are unavailable in this environment." />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const page = await hydrateContentWavePage(db, user.id, await listProfileWaves(db, user.id));

  return (
    <>
      <PageHeader title={TERMS.waves} description={`Every ${TERMS.wave.toLowerCase()} you've published.`} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ContentWaveList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          loadMore={loadMyWaves}
          emptyIcon={<AudioLines className="size-5" />}
          emptyTitle={`You haven't published a ${TERMS.wave.toLowerCase()} yet`}
          emptyDescription="Record or upload your first Wave to get started."
        />
      </div>
    </>
  );
}
