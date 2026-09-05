import { TERMS } from "@/config/terminology";
import { requireOnboarded } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { getBackingTrackById } from "@/lib/db/backingTracks";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { RecordStageBackingTrack } from "@/components/create";

import { CreateFlow } from "./CreateFlow";

export const metadata = { title: `${TERMS.create} ${TERMS.aWave}` };

interface CreatePageProps {
  searchParams: Promise<{ track?: string }>;
}

/**
 * Create: record in the app or upload an existing file (spec §17, §18).
 * `/create` is a protected route: `src/proxy.ts` already redirects a
 * signed-out/not-onboarded visitor at the edge, but that's a UX convenience,
 * never the authorization boundary (see docs/SECURITY.md) — every protected
 * Server Component independently calls `requireOnboarded`, and this one did
 * not until now. See the header comment in `CreateFlow.tsx` for the client
 * capture flow and `actions.ts` for the Server Actions it now calls.
 *
 * `?track=<id>` (from Explore's "Tracks to sing over" lane or `/tracks`,
 * spec §4) is resolved here, server-side, rather than fetched again on the
 * client: `getBackingTrackById` already reads through the caller's RLS-scoped
 * client, so an id for a track that is neither curated, open-for-vocals nor
 * the caller's own simply resolves to `null` — a quiet fallback to "no
 * track", never an error screen over one stale or mistyped link.
 */
export default async function CreatePage({ searchParams }: CreatePageProps) {
  await requireOnboarded(routes.create());
  const { track: trackId } = await searchParams;

  const initialBackingTrack = trackId ? await loadBackingTrack(trackId) : null;

  return <CreateFlow initialBackingTrack={initialBackingTrack} />;
}

async function loadBackingTrack(trackId: string): Promise<RecordStageBackingTrack | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = await createServerSupabaseClient();
    const track = await getBackingTrackById(db, trackId);
    if (!track || (!track.isCurated && !track.openForVocals)) return null;
    const asset = await getAudioAssetById(db, track.audioAssetId);
    if (!asset) return null;
    return {
      id: track.id,
      title: track.title,
      artistCredit: track.artistCredit,
      audioAssetId: asset.id,
      durationMs: asset.durationMs,
    };
  } catch {
    // A missing/unreachable track is never a reason to block the whole
    // record screen — the singer just starts without one (spec §38).
    return null;
  }
}
