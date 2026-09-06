import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "@/components/ui/icons";

import { PageHeader } from "@/components/layout";
import { BlockedList, ReportsList } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listBlockedProfilesWithIdentity } from "@/lib/db/blocks";
import { isModerator } from "@/lib/db/moderation";
import { listMyReports } from "@/lib/db/reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { DownloadDataButton } from "./DownloadDataButton";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("SafetySettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Safety (spec §25/§26): blocked users (with unblock) and your own filed reports, read-only. */
export default async function SafetySettingsPage() {
  const user = await requireUser(routes.settingsSafety());
  const t = await getTranslations("SafetySettingsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
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
      <PageHeader title={t("title")} />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        {isMod ? (
          <Link
            href={routes.moderation()}
            className="flex items-center gap-2 border-b border-hairline py-3.5 type-body text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
          >
            <ShieldCheck className="size-4 text-ink-subtle" aria-hidden="true" />
            {t("moderationQueue")}
          </Link>
        ) : null}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">{t("blockedAccountsHeading")}</h2>
          <BlockedList blocked={blockedProfiles} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">{t("yourReportsHeading")}</h2>
          <ReportsList reports={reportsPage.items} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg">{t("yourDataHeading")}</h2>
          <DownloadDataButton />
        </section>
      </div>
    </>
  );
}
