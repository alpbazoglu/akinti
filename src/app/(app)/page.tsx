
import Link from "next/link";

import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState } from "@/components/ui";
import { FollowingFeed } from "@/components/feed";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { listHomeFeed } from "@/lib/db/waves";
import { hydrateWaveCards } from "@/lib/feed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: TERMS.home };

/**
 * Home (spec s9): the personalised feed of Waves from creators the viewer
 * follows. Visibility is enforced end to end by RLS + `can_view_wave` —
 * `listHomeFeed` never has to re-derive who may see what. A brand-new
 * account with no follows routes into Explore instead of a blank feed
 * (spec s9's explicit empty-state rule), with a Record-your-first-Wave path
 * one tap away so the "aha moment" stays close (spec s8).
 */
export default async function HomePage() {
  const user = await requireUser(routes.home());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.home} />
        <EmptyState
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so the feed can't be loaded here."
        />
      </>
    );
  }

  const supabase = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateWaveCards>> = [];
  let initialCursor: string | null = null;
  let loadError: string | null = null;
  try {
    const page = await listHomeFeed(supabase, user.id, { limit: 10 });
    initialItems = await hydrateWaveCards(supabase, page.items, user.id);
    initialCursor = page.nextCursor;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Something went wrong.";
  }

  return (
    <>
      <PageHeader title={TERMS.home} />

      {loadError ? (
        <ErrorState description={loadError} />
      ) : initialItems.length === 0 ? (
        <EmptyState
          title="Your feed is quiet"
          description={`Follow a few creators and their ${TERMS.waves} land here. Not sure where to start? ${TERMS.explore} has the rest of the network.`}
          action={
            <Link
              href={routes.explore()}
              className="text-sm font-medium text-accent underline underline-offset-2"
            >
              Go to {TERMS.explore}
            </Link>
          }
          secondaryAction={
            <Link
              href={routes.create()}
              className="text-sm font-medium text-fg-muted underline underline-offset-2"
            >
              Record your first {TERMS.wave}
            </Link>
          }
        />
      ) : (
        <FollowingFeed initialItems={initialItems} initialCursor={initialCursor} />
      )}
    </>
  );
}
