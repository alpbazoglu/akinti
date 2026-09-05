import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { getCurrentUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatAbsoluteTime } from "@/lib/ui";

export const metadata = { title: `Account suspended · ${TERMS.brand}` };

/** Plain helper (not a component) so the `Date.now()` read isn't flagged as an impure render call. */
function isSuspensionActive(suspendedUntil: string | null): boolean {
  return suspendedUntil !== null && new Date(suspendedUntil).getTime() > Date.now();
}

/**
 * The suspension landing page (spec §26, migration 23). Reads
 * `getCurrentUser()` directly rather than `requireUser`/`requireOnboarded`
 * — those redirect a suspended account HERE, so calling either from this
 * page would be an immediate redirect loop back to itself. Signed-out
 * visitors are sent to `/login` with a plain `redirect()` for the same
 * reason.
 *
 * A signed-in, NOT-suspended visitor who lands here directly (e.g. a stale
 * bookmark, or a suspension that has since expired) is sent home instead of
 * shown a stale "you're suspended" message.
 */
export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login());
  }

  if (!isSupabaseConfigured()) {
    redirect(routes.home());
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("suspended_until")
    .eq("id", user.id)
    .maybeSingle();

  const suspendedUntil = data?.suspended_until ?? null;

  if (!isSuspensionActive(suspendedUntil)) {
    redirect(routes.home());
  }

  return (
    <>
      <PageHeader title="Account suspended" />
      <EmptyState
        title="Your account is temporarily suspended"
        description={
          <>
            A moderator suspended this account following a review. You can browse{" "}
            {TERMS.brand} again after{" "}
            <span className="font-medium text-fg">{formatAbsoluteTime(suspendedUntil as string)}</span>.
            If you believe this is a mistake, contact support.
          </>
        }
      />
    </>
  );
}
