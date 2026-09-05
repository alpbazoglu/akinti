import { PageHeader } from "@/components/layout";
import { BackingTracksLane, type BackingTrackCard } from "@/components/feed";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireOnboarded } from "@/lib/auth/server";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { listBackingTracks } from "@/lib/db/backingTracks";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient, type SupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Tracks" };

const PAGE_SIZE = 50;

/**
 * The backing-track library, browsable on its own (spec §4, PRODUCT_V2 §4.4).
 *
 * Explore's "Tracks to sing over" lane (`BackingTracksLane`, shared here
 * verbatim) is a teaser of a handful of tracks; this is the full library, for
 * `RecordStage`'s "Sing over a track" row (`onChooseTrack`) to send someone
 * to when the teaser isn't enough. Picking one still works the same way —
 * "Sing over this" links to `/create?track=<id>`, which `/create`'s page
 * resolves server-side before handing `RecordStage` a real backing track.
 */
export default async function TracksPage() {
  await requireOnboarded(routes.tracks());

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title="Tracks" />
        <p className="akinti-page type-body measure text-ink-muted">
          The track library isn&apos;t reachable from this build.
        </p>
      </>
    );
  }

  const db = await createServerSupabaseClient();
  let tracks: BackingTrackCard[] = [];
  let loadError = false;

  try {
    tracks = await loadBackingTracks(db);
  } catch {
    loadError = true;
  }

  return (
    <>
      <PageHeader title="Tracks" />

      {loadError ? (
        <p className="akinti-page type-body measure text-ink-muted">
          Couldn&apos;t load the track library. Try again in a moment.
        </p>
      ) : tracks.length === 0 ? (
        <div className="akinti-page flex flex-col items-start gap-3">
          <p className="type-body measure text-ink">No tracks are open for vocals yet.</p>
          <p className="type-body-sm measure text-ink-muted">
            You can still {TERMS.record.toLowerCase()} without one, or upload your own instrumental
            from {TERMS.create}.
          </p>
        </div>
      ) : (
        <BackingTracksLane tracks={tracks} />
      )}
    </>
  );
}

/** Same shape Explore's teaser lane builds, just for the whole library. */
async function loadBackingTracks(db: SupabaseServerClient): Promise<BackingTrackCard[]> {
  const page = await listBackingTracks(db, { limit: PAGE_SIZE });
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
