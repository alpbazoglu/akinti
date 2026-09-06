import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { PrivacyForm } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listPendingFollowRequests } from "@/lib/db/follows";
import { getProfileById } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("PrivacySettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/** Settings → Privacy (spec §25): public/private, who can message/Duet-request/comment, default Wave visibility. */
export default async function PrivacySettingsPage() {
  const user = await requireUser(routes.settingsPrivacy());
  const t = await getTranslations("PrivacySettingsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  if (!profile) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("couldNotLoadTitle")} description={t("couldNotLoadDescription")} />
      </>
    );
  }

  const pending = await listPendingFollowRequests(supabase, user.id, { limit: 50 });

  return (
    <>
      <PageHeader
        title={t("title")}
      />
      <div className="px-4 pb-8 sm:px-5">
        <PrivacyForm
          initialPrivacy={profile.privacy}
          initialMessagePermission={profile.permissions.message}
          initialDuetPermission={profile.permissions.duet}
          initialCommentPermission={profile.permissions.comment}
          initialDefaultWaveVisibility={profile.permissions.defaultWaveVisibility}
          pendingFollowRequestCount={pending.items.length}
        />
      </div>
    </>
  );
}
