import { Bell } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata = { title: TERMS.notifications };

/** Notifications: follows, comments, saves, shares and Duet activity (spec 23). */
export default function NotificationsPage() {
  return (
    <PlaceholderPage
      title={TERMS.notifications}
      description="Follows, comments, saves, shares and Duet activity."
      icon={<Bell className="size-6" />}
      emptyTitle="No notifications"
      emptyDescription={`When someone ${TERMS.comments.toLowerCase()} on, ${TERMS.saves.toLowerCase()} or ${TERMS.shares.toLowerCase()} one of your ${TERMS.waves} — or asks you for a ${TERMS.duet} — you will hear about it here.`}
    />
  );
}
