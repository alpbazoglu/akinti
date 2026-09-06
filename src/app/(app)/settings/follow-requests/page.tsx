import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { FollowRequestsList } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listPendingFollowRequests } from "@/lib/db/follows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("FollowRequestsPage");
  return { title: t("title") };
}

/** Pending follow requests inbox for a private account (spec §21). */
export default async function FollowRequestsPage() {
  const user = await requireUser(routes.settingsFollowRequests());
  const t = await getTranslations("FollowRequestsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("backendNotConfiguredTitle")} description={t("backendNotConfiguredDescription")} />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const requests = await listPendingFollowRequests(supabase, user.id, { limit: 50 });

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="px-4 pb-8 sm:px-5">
        <FollowRequestsList requests={requests.items} />
      </div>
    </>
  );
}
