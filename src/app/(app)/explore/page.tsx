import Link from "next/link";

import { PageHeader } from "@/components/layout";
import {
  BackingTracksLane,
  ExploreView,
  OpenCallsLane,
  RisingCreatorsStrip,
  type BackingTrackCard,
  type OpenCall,
  type RisingCreator,
} from "@/components/feed";
import { Search } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getCurrentUser } from "@/lib/auth/server";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { listBackingTracks } from "@/lib/db/backingTracks";
import { getFollowEdgesForViewer, getRisingCreators, type FollowEdge } from "@/lib/db/discovery";
import { listOpenCalls } from "@/lib/db/openCalls";
import { getWavesByIds, listTrendingWaves } from "@/lib/db/waves";
import { hydrateWaveCards, nextOffsetCursor } from "@/lib/feed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient, type SupabaseServerClient } from "@/lib/supabase/server";

import { loadCreatorSignatures } from "./signatures";

export const metadata = { title: TERMS.explore };

const INITIAL_CATEGORY = "trending" as const;
const INITIAL_PAGE_SIZE = 10;
const CREATOR_TILES = 8;
const OPEN_CALLS = 3;
const BACKING_TRACKS = 6;

/**
 * Explore (SCREENS.md §3): the discovery surface, and the only screen allowed
 * a horizontal element.
 *
 * Public for anonymous visitors — `getCurrentUser()` degrades to `null`
 * rather than redirecting, and every read still rides on RLS, so a signed-out
 * visitor only ever sees Waves that are open to everyone.
 *
 * The lanes are ordered by how quickly they turn a cold-start reader into
 * someone listening: people to follow, calls they can answer today, tracks
 * they can sing over, then the stream itself.
 */
export default async function ExplorePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.explore} />
        <p className="akinti-page type-body measure text-ink-muted">
          Discovery isn&apos;t reachable from this build.
        </p>
      </>
    );
  }

  const user = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateWaveCards>> = [];
  let initialCursor: string | null = null;
  let risingCreators: RisingCreator[] = [];
  let openCalls: OpenCall[] = [];
  let tracks: BackingTrackCard[] = [];
  let loadError: string | null = null;

  try {
    // `loadOpenCalls`/`loadBackingTracks` don't depend on `trending`/`rising`
    // (or on each other) at all, and the previous pass ran them in their own
    // sequential stage after everything else anyway — folding them into this
    // same round removes a whole network round trip for free
    // (docs/qa/perf2/WATERFALL.md).
    const [trending, risingProfiles, openCallsResult, tracksResult] = await Promise.all([
      listTrendingWaves(supabase, { limit: INITIAL_PAGE_SIZE, offset: 0 }),
      getRisingCreators(supabase, { limit: CREATOR_TILES }),
      // Open calls and the track library are additions to the screen, never
      // its spine: if either read fails, Explore still works.
      loadOpenCalls(supabase, user?.id ?? null).catch(() => []),
      loadBackingTracks(supabase).catch(() => []),
    ]);
    openCalls = openCallsResult;
    tracks = tracksResult;
    initialCursor = nextOffsetCursor(0, trending.length, trending.length >= INITIAL_PAGE_SIZE);

    // `hydrateWaveCards(trending)` and the rising-creators follow-edges/
    // signatures lookups are independent of each other too (the latter two
    // only need `risingProfiles`' ids) — one round instead of two.
    const [hydratedTrending, edges, signatures] = await Promise.all([
      hydrateWaveCards(supabase, trending, user?.id ?? null),
      user
        ? getFollowEdgesForViewer(
            supabase,
            user.id,
            risingProfiles.map((profile) => profile.id),
          )
        : Promise.resolve(new Map<string, FollowEdge>()),
      loadCreatorSignatures(
        supabase,
        risingProfiles.map((profile) => profile.id),
      ),
    ]);

    initialItems = hydratedTrending;
    risingCreators = risingProfiles.map((profile) => ({
      profile,
      followStatus: edges.get(profile.id)?.status ?? null,
      followsViewer: edges.get(profile.id)?.followsViewer ?? false,
      signature: signatures.get(profile.id),
    }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : null;
  }

  return (
    <>
      <PageHeader
        title={TERMS.explore}
        actions={
          <Link
            href={routes.search()}
            aria-label={TERMS.search}
            className="akinti-press inline-flex size-11 items-center justify-center rounded-[13px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Search className="size-6" aria-hidden="true" />
          </Link>
        }
      />

      {loadError ? (
        <div className="akinti-page flex flex-col items-start gap-3 pb-8">
          <p role="alert" className="type-body measure text-ink">
            Couldn&apos;t reach the stream.
          </p>
          <Link
            href={routes.explore()}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Try again
          </Link>
        </div>
      ) : (
        <>
          <RisingCreatorsStrip creators={risingCreators} isSignedIn={Boolean(user)} />
          <OpenCallsLane calls={openCalls} />
          <BackingTracksLane tracks={tracks} />
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

/** Open calls, with the source Wave each one hangs off. */
async function loadOpenCalls(
  db: SupabaseServerClient,
  viewerId: string | null,
): Promise<OpenCall[]> {
  const page = await listOpenCalls(db, { limit: OPEN_CALLS });
  if (page.items.length === 0) return [];

  const waves = await getWavesByIds(
    db,
    page.items.map((call) => call.waveId),
  );
  const cards = await hydrateWaveCards(db, waves, viewerId);
  const cardByWaveId = new Map(cards.map((card) => [card.id, card]));

  const calls: OpenCall[] = [];
  for (const call of page.items) {
    const card = cardByWaveId.get(call.waveId);
    // A call whose Wave RLS hides is not shown at all, rather than shown
    // without the audio it is asking people to record against.
    if (!card) continue;
    calls.push({
      waveId: call.waveId,
      prompt: call.prompt,
      deadlineAt: call.deadlineAt,
      wave: {
        id: card.id,
        title: card.title,
        audioAssetId: card.audioAssetId,
        peaks: card.peaks,
        duration: card.duration,
        creator: {
          username: card.creator.username,
          displayName: card.creator.displayName,
        },
      },
    });
  }
  return calls;
}

/** The curated instrumental library, with a real trace for each track. */
async function loadBackingTracks(db: SupabaseServerClient): Promise<BackingTrackCard[]> {
  const page = await listBackingTracks(db, { limit: BACKING_TRACKS });
  if (page.items.length === 0) return [];

  const assets = await Promise.all(
    page.items.map((track) => getAudioAssetById(db, track.audioAssetId)),
  );

  const cards: BackingTrackCard[] = [];
  page.items.forEach((track, index) => {
    const asset = assets[index];
    if (!asset) return;
    cards.push({
      id: track.id,
      title: track.title,
      artistCredit: track.artistCredit,
      sourceUrl: track.sourceUrl,
      audioAssetId: asset.id,
      peaks: resolveWavePeaks(asset.peaks?.data, asset.id, asset.peaks?.bits),
      durationSeconds: asset.durationMs ? asset.durationMs / 1000 : undefined,
      bpm: track.bpm,
      musicalKey: track.musicalKey,
      genreTags: track.genreTags,
    });
  });
  return cards;
}
