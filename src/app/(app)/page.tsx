import { PageHeader } from "@/components/layout";
import { FollowingFeed, HomeEmptyState } from "@/components/feed";
import type { TraceRowWave } from "@/components/feed";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { listHomeFeed, listTrendingWaves } from "@/lib/db/waves";
import { hydrateWaveCards } from "@/lib/feed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { listHeardWaveIds } from "./listened";

export const metadata = { title: TERMS.home };

/** How many real Waves the empty state plays. Three, per §8.14. */
const EMPTY_STATE_WAVES = 3;

/**
 * Home (SCREENS.md §2): the stream of Waves from the people this reader
 * follows, hung on the 44px rail with a waterline between one Wave and the
 * next. Visibility is enforced end to end by RLS and `can_view_wave`.
 *
 * An account with nothing in its stream does not get an icon in a grey circle
 * (§12.5). It gets three real Waves from Explore that play where they stand,
 * and one key into Explore — the empty state is a working feed (§8.14).
 */
export default async function HomePage() {
  const user = await requireUser(routes.home());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.home} />
        <p className="akinti-page type-body measure text-ink-muted">
          The stream isn&apos;t reachable from this build.
        </p>
      </>
    );
  }

  const supabase = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateWaveCards>> = [];
  let initialCursor: string | null = null;
  let unheardIds: string[] = [];
  let elsewhere: TraceRowWave[] = [];
  let loadError: string | null = null;

  try {
    const page = await listHomeFeed(supabase, user.id, { limit: 10 });
    initialItems = await hydrateWaveCards(supabase, page.items, user.id);
    initialCursor = page.nextCursor;

    if (initialItems.length > 0) {
      const heard = await listHeardWaveIds(
        supabase,
        user.id,
        initialItems.map((item) => item.id),
      );
      unheardIds = initialItems.filter((item) => !heard.has(item.id)).map((item) => item.id);
    } else {
      const trending = await listTrendingWaves(supabase, { limit: EMPTY_STATE_WAVES, offset: 0 });
      const cards = await hydrateWaveCards(supabase, trending, user.id);
      elsewhere = cards.map(toTraceRow);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : null;
  }

  return (
    <>
      <PageHeader title={TERMS.home} />

      {loadError ? (
        <div className="akinti-page flex flex-col items-start gap-3 pb-8">
          <p role="alert" className="type-body measure text-ink">
            Couldn&apos;t reach the stream.
          </p>
          <a
            href={routes.home()}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Try again
          </a>
        </div>
      ) : initialItems.length === 0 ? (
        <HomeEmptyState waves={elsewhere} />
      ) : (
        <FollowingFeed
          initialItems={initialItems}
          initialCursor={initialCursor}
          unheardIds={unheardIds}
        />
      )}
    </>
  );
}

function toTraceRow(card: Awaited<ReturnType<typeof hydrateWaveCards>>[number]): TraceRowWave {
  return {
    id: card.id,
    title: card.title,
    audioAssetId: card.audioAssetId,
    peaks: card.peaks,
    duration: card.duration,
    creator: {
      username: card.creator.username,
      displayName: card.creator.displayName,
    },
  };
}
