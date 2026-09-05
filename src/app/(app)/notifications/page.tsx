import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { countUnreadNotifications, listNotifications } from "@/lib/db/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NotificationsView } from "@/components/notifications";
import { ErrorState } from "@/components/ui";
import { PageHeader } from "@/components/layout";
import type { NotificationWithActor, Page } from "@/types/domain";

export const metadata = { title: TERMS.notifications };

/** Notifications: follows, comments, saves, shares and Duet activity (spec 23). */
export default async function NotificationsPage() {
  const user = await requireUser(routes.notifications());
  const supabase = await createServerSupabaseClient();

  let initial: { page: Page<NotificationWithActor>; unreadCount: number } | null = null;
  let loadError: string | null = null;
  try {
    const [page, unreadCount] = await Promise.all([
      listNotifications(supabase, { limit: 20 }),
      countUnreadNotifications(supabase, user.id),
    ]);
    initial = { page, unreadCount };
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Something went wrong.";
  }

  return (
    <>
      <PageHeader
        title={TERMS.notifications}
      />
      {loadError || !initial ? (
        <ErrorState description={loadError ?? "We could not load your notifications right now."} />
      ) : (
        <NotificationsView
          userId={user.id}
          initialItems={initial.page.items}
          initialCursor={initial.page.nextCursor}
          initialUnreadCount={initial.unreadCount}
        />
      )}
    </>
  );
}
