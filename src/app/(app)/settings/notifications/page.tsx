import { Bell } from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata = { title: `Notifications · ${TERMS.settings}` };

/**
 * Notification preferences (spec s25: "message, Duet, comment, follower
 * notifications"). `profiles` (migration 02) has no preference columns yet —
 * toggles need somewhere server-side to persist to, and there is currently
 * nowhere. Rather than fake working switches, this renders an honest
 * "not available yet" state. See the Stage 11 report for the exact migration
 * this needs (a `notification_preferences` jsonb column, or a dedicated
 * table) so a future stage can wire real Switch controls straight in here.
 */
export default async function NotificationsSettingsPage() {
  await requireUser(routes.settingsNotifications());

  return (
    <PlaceholderPage
      title="Notifications"
      description="Choose what you want to hear about."
      icon={<Bell className="size-6" />}
      emptyTitle="Preferences are not available yet"
      emptyDescription={`There is nowhere to save a preference yet — no column or table for it exists (see docs/PRODUCT.md). Until then, every ${TERMS.notifications.toLowerCase()} type stays on. There are no Like notifications, because there are no Likes.`}
    />
  );
}
