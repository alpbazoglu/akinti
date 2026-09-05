/**
 * `backing_tracks` reads (spec §4 "Backing tracks without licensing risk").
 *
 * All reads here go through the caller's own RLS-scoped client — `RLS`
 * (`backing_tracks_select`, migration 20260905110000) already restricts rows
 * to curated/open-for-vocals tracks plus the caller's own uploads, so there
 * is no privileged/admin path needed the way `audio_assets`'s raw storage
 * paths require one.
 */

import type { AudioEnhancementPreset, AudioJobType } from "@/types/domain";
import type { BackingTrack } from "@/types/domain";
import type { BackingTrackRow, Json } from "@/types/database";

import { toBackingTrack } from "./mappers";
import { NotFoundError, unwrap, unwrapMaybe } from "./types";
import type { Db } from "./types";

/** Track plays under the vocal by default (spec §4: "sing over a track"). */
export const DEFAULT_BACKING_TRACK_GAIN_DB = -6;

export interface ListBackingTracksParams {
  genre?: string | null;
  musicalKey?: string | null;
  bpmMin?: number | null;
  bpmMax?: number | null;
  cursor?: string | null;
  limit?: number;
}

export interface BackingTrackPage {
  items: BackingTrack[];
  /** Opaque cursor for the next page, or `null` when this was the last page. */
  nextCursor: string | null;
}

/** Encodes the keyset cursor `list_backing_tracks` (migration 20260905110000) expects: `"<created_at>|<id>"`. */
function cursorOf(row: BackingTrackRow): string {
  return `${row.created_at}|${row.id}`;
}

export async function listBackingTracks(db: Db, params: ListBackingTracksParams = {}): Promise<BackingTrackPage> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const { data, error } = await db.rpc("list_backing_tracks", {
    p_genre: params.genre ?? null,
    p_key: params.musicalKey ?? null,
    p_bpm_min: params.bpmMin ?? null,
    p_bpm_max: params.bpmMax ?? null,
    p_cursor: params.cursor ?? null,
    p_limit: limit,
  });
  if (error) {
    throw error;
  }
  const rows = data ?? [];
  const items = rows.map(toBackingTrack);
  const nextCursor = rows.length === limit ? cursorOf(rows[rows.length - 1]) : null;
  return { items, nextCursor };
}

export async function getBackingTrackById(db: Db, id: string): Promise<BackingTrack | null> {
  const result = await db.from("backing_tracks").select("*").eq("id", id).maybeSingle();
  const row = unwrapMaybe("getBackingTrackById", result);
  return row ? toBackingTrack(row) : null;
}

/**
 * Same as `getBackingTrackById`, but throws `NotFoundError` — used by
 * `publishWave` (`src/app/(app)/create/actions.ts`), where a missing/
 * not-visible track (RLS hides tracks that are neither curated, open, nor
 * the caller's own) must fail the publish rather than silently proceed
 * without a track.
 */
export async function requireBackingTrack(db: Db, id: string): Promise<BackingTrack> {
  const track = await getBackingTrackById(db, id);
  if (!track) {
    throw new NotFoundError("backing track");
  }
  if (!track.isCurated && !track.openForVocals) {
    throw new NotFoundError("backing track");
  }
  return track;
}

export interface EnqueueBackingTrackMixJobInput {
  /** The vocal Wave's own audio asset — becomes the mixed output in place, exactly like an ordinary Duet's contribution stem. */
  vocalAssetId: string;
  /** `BackingTrack.audioAssetId` — the instrumental, used as the reference stem. */
  trackAudioAssetId: string;
  preset?: AudioEnhancementPreset;
  /** dB gain applied to the track before mixing (spec §4: "−6 dB default"). */
  trackGainDb?: number;
}

/**
 * Queue the `mix_duet` job that lays a vocal Wave's audio over a backing
 * track (spec §4). Reuses `scripts/worker.ts`'s existing Duet mixdown path
 * verbatim — `reference_asset_id`/`offset_ms` mean the same thing they do
 * for an ordinary Duet, offset is always `0` (the vocal and the track start
 * together), and `reference_gain_db` (new, see
 * `src/lib/duet/ffmpegChain.ts`'s `DuetMixChainOptions.referenceGainDb`)
 * turns the track down so the vocal sits in front.
 */
export async function enqueueBackingTrackMixJob(
  db: Db,
  input: EnqueueBackingTrackMixJobInput,
): Promise<number> {
  const result = await db.rpc("enqueue_audio_job", {
    p_audio_asset_id: input.vocalAssetId,
    p_job_type: "mix_duet" satisfies AudioJobType,
    p_payload: {
      preset: input.preset ?? "studio",
      reference_asset_id: input.trackAudioAssetId,
      offset_ms: 0,
      reference_gain_db: input.trackGainDb ?? DEFAULT_BACKING_TRACK_GAIN_DB,
    } satisfies Json,
  });
  return unwrap("enqueueBackingTrackMixJob", result);
}
