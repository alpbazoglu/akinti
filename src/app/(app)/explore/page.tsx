import { AudioLines, Search } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout";
import { EmptyState, ErrorState } from "@/components/ui";
import { ExploreView, RisingCreatorsStrip, type RisingCreator } from "@/components/feed";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { getCurrentUser } from "@/lib/auth/server";
import { getFollowEdgesForViewer, getRisingCreators, type FollowEdge } from "@/lib/db/discovery";
import { listTrendingWaves } from "@/lib/db/waves";
import { hydrateWaveCards, nextOffsetCursor } from "@/lib/feed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: TERMS.explore };

const INITIAL_CATEGORY = "trending" as const;
const INITIAL_PAGE_SIZE = 10;

/**
 * Explore (spec s10): the discovery engine. Public for anonymous visitors —
 * `getCurrentUser()` degrades to `null` rather than redirecting, and every
 * read still rides on RLS, so a signed-out visitor only ever sees
 * `visibility = 'everyone'` Waves and viewable profiles regardless.
 *
 * The first Trending page and the "Rising creators" strip render directly
 * here (no loading flash on first paint); `ExploreView` takes over for every
 * other category and every subsequent page.
 */
export default async function ExplorePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.explore} />
        <EmptyState
          icon={<AudioLines className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so discovery can't run here."
        />
      </>
    );
  }

  const user = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateWaveCards>> = [];
  let initialCursor: string | null = null;
  let risingCreators: RisingCreator[] = [];
  let loadError: string | null = null;

  try {
    const [trending, risingProfiles] = await Promise.all([
      listTrendingWaves(supabase, { limit: INITIAL_PAGE_SIZE, offset: 0 }),
      getRisingCreators(supabase, { limit: 10 }),
    ]);
    initialItems = await hydrateWaveCards(supabase, trending, user?.id ?? null);
    initialCursor = nextOffsetCursor(0, trending.length, trending.length >= INITIAL_PAGE_SIZE);

    const edges: Map<string, FollowEdge> = user
      ? await getFollowEdgesForViewer(
          supabase,
          user.id,
          risingProfiles.map((p) => p.id),
        )
      : new Map();
    risingCreators = risingProfiles.map((profile) => ({
      profile,
      followStatus: edges.get(profile.id)?.status ?? null,
      followsViewer: edges.get(profile.id)?.followsViewer ?? false,
    }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Something went wrong.";
  }

  return (
    <>
      <PageHeader
        title={TERMS.explore}
        description={`Trending, new and rising ${TERMS.waves.toLowerCase()}, plus creators ${TERMS.openForDuet.toLowerCase()}.`}
        actions={
          <Link
            href={routes.search()}
            aria-label={TERMS.search}
            className="inline-flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>
        }
      />

      {loadError ? (
        <ErrorState description={loadError} />
      ) : (
        <>
          <RisingCreatorsStrip creators={risingCreators} isSignedIn={Boolean(user)} />
          <ExploreView
            initialCategory={INITIAL_CATEGORY}
            initialItems={initialItems}
            initialCursor={initialCursor}
          />
        </>
      )}
    </>
  );
}
