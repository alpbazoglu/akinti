import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getProfileById } from "@/lib/db/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { NotificationsForm } from "./NotificationsForm";

export const metadata = { title: `Notifications · ${TERMS.settings}` };

/**
 * Settings → Notifications (spec §23, §25). `profiles.notification_preferences`
 * (migration 22) is now real — this used to render an honest "not available
 * yet" state because there was nowhere to persist a toggle; that gap is
 * closed, so this is a real form now.
 */
export default async function NotificationsSettingsPage() {
  const user = await requireUser(routes.settingsNotifications());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Notifications" description="Choose what you want to hear about." />
        <EmptyState
          title="Backend not configured"
          description="Notification preferences are unavailable in this environment."
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Choose what you want to hear about. Saves and Shares always notify — there's no toggle for those yet."
      />
      <div className="flex flex-col gap-6 px-4 pb-8 sm:px-5">
        <NotificationsForm initialPreferences={profile?.notificationPreferences ?? {}} />
      </div>
    </>
  );
}
