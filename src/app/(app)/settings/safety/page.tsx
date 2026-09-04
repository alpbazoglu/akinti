import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { BlockedList, ReportsList } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { listBlockedProfilesWithIdentity } from "@/lib/db/blocks";
import { isModerator } from "@/lib/db/moderation";
import { listMyReports } from "@/lib/db/reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { DownloadDataButton } from "./DownloadDataButton";

export const metadata = { title: `Safety · ${TERMS.settings}` };

/** Settings → Safety (spec §25/§26): blocked users (with unblock) and your own filed reports, read-only. */
export default async function SafetySettingsPage() {
  const user = await requireUser(routes.settingsSafety());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Safety" />
        <EmptyState title="Backend not configured" description="Safety settings are unavailable in this environment." />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();
  const [blockedProfiles, reportsPage, isMod] = await Promise.all([
    listBlockedProfilesWithIdentity(supabase, admin, user.id),
    listMyReports(supabase, user.id, { limit: 50 }),
    isModerator(supabase),
  ]);

  return (
    <>
      <PageHeader title="Safety" description="Blocked users and the reports you've filed." />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        {isMod ? (
          <Link
            href={routes.moderation()}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
            Moderation queue
          </Link>
        ) : null}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">Blocked accounts</h2>
          <BlockedList blocked={blockedProfiles} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">Your reports</h2>
          <ReportsList reports={reportsPage.items} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">Your data</h2>
          <DownloadDataButton />
        </section>
      </div>
    </>
  );
}
