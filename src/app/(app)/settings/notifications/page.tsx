import { Settings } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Notifications · ${TERMS.settings}` };

export default function NotificationsSettingsPage() {
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
