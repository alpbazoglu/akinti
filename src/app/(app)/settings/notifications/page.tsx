import { Settings } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Notifications · ${TERMS.settings}` };

export default async function NotificationsSettingsPage() {
  await requireUser(routes.settingsNotifications());

  return (
    <PlaceholderPage
      title="Notifications"
      description="Choose what you want to hear about."
      icon={<Settings className="size-6" />}
      emptyTitle="Notification settings are not wired up yet"
      emptyDescription="Notification preferences arrive with the notifications stage. There are no Like notifications, because there are no Likes."
    />
  );
}
