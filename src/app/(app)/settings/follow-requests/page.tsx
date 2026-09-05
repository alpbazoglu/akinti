import { PageHeader } from "@/components/layout";
import { FollowRequestsList } from "@/components/profile";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listPendingFollowRequests } from "@/lib/db/follows";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: "Follow requests" };

/** Pending follow requests inbox for a private account (spec §21). */
export default async function FollowRequestsPage() {
  const user = await requireUser(routes.settingsFollowRequests());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Follow requests" />
        <EmptyState title="Backend not configured" description="Follow requests are unavailable in this environment." />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const requests = await listPendingFollowRequests(supabase, user.id, { limit: 50 });

  return (
    <>
      <PageHeader title="Follow requests" />
      <div className="px-4 pb-8 sm:px-5">
        <FollowRequestsList requests={requests.items} />
      </div>
    </>
  );
}
