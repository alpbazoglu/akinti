import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { hasPushSubscription } from "@/lib/push/subscriptions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { NotificationsForm } from "./NotificationsForm";
import { PushToggle } from "./PushToggle";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("NotificationsSettingsPage");
  return { title: tPage("metaTitle", { settings: t("settings") }) };
}

/**
 * Settings → Notifications (spec §23, §25). `profiles.notification_preferences`
 * (migration 22) is now real — this used to render an honest "not available
 * yet" state because there was nowhere to persist a toggle; that gap is
 * closed, so this is a real form now.
 */
export default async function NotificationsSettingsPage() {
  const user = await requireUser(routes.settingsNotifications());
  const t = await getTranslations("NotificationsSettingsPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState
          title={t("backendNotConfiguredTitle")}
          description={t("backendNotConfiguredDescription")}
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [profile, subscribed] = await Promise.all([
    getProfileById(supabase, user.id),
    hasPushSubscription(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
      />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <NotificationsForm initialPreferences={profile?.notificationPreferences ?? {}} />
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
          <PushToggle initialSubscribed={subscribed} />
        </div>
      </div>
    </>
  );
}
