/**
 * Profile-page Wave hydration (spec §21 — Waves/Duets tabs).
 *
 * `src/lib/db/waves.ts` (owned by the waves agent) already exports
 * `listProfileWaves`/`listProfileDuets`, which is all the *querying* this
 * page needs. What it doesn't do is turn a bare `Wave` into something
 * `WaveCard` can render — a signed playback URL, decoded peaks, and accepted
 * collaborator profiles. This file only composes existing exports
 * (`waves.ts`, `audioAssets.ts`) via the Supabase client directly, per the
 * "thin helper in profileWaves.ts" guidance for the profiles agent — it does
 * not duplicate any authorization or query logic those files already own.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAudioAssetById, mintSignedAudioUrl } from "./audioAssets";
import { listProfileDuets, listProfileWaves, listWaveCollaboratorProfiles } from "./waves";
import type { Db } from "./types";
import type { Database } from "@/types/database";
import type { Page, Wave } from "@/types/domain";

/** A collaborator, shaped for `WaveCard`'s `WaveCardPerson` — kept local to
 *  avoid this data-layer file depending on a `src/components` module. */
export interface ProfileWaveCollaborator {
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ProfileWaveCard {
  wave: Wave;
  audioUrl: string;
  peaks: readonly number[];
  durationMs: number | null;
  collaborators: ProfileWaveCollaborator[];
}

/**
 * Attach a signed playback URL, peaks and collaborator profiles to a page of
 * Waves. Any Wave whose audio asset can't be read or signed (in practice:
 * never, since `listProfileWaves`/`listProfileDuets` already filtered by
 * `can_view_wave`) is dropped rather than crashing the whole tab — a Wave
 * card with a broken player is a worse experience than one fewer card.
 */
export async function hydrateProfileWaves(
  db: Db,
  admin: SupabaseClient<Database>,
  waves: readonly Wave[],
): Promise<ProfileWaveCard[]> {
  const hydrated = await Promise.all(
    waves.map(async (wave): Promise<ProfileWaveCard | null> => {
      const asset = await getAudioAssetById(db, wave.audioAssetId);
      if (!asset) {
        return null;
      }

      let audioUrl: string;
      try {
        const variant = asset.processedPath ? "processed" : "original";
        const signed = await mintSignedAudioUrl(db, admin, wave.audioAssetId, variant);
        audioUrl = signed.url;
      } catch {
        return null;
      }

      const collaboratorEntries = await listWaveCollaboratorProfiles(db, wave.id);
      const collaborators: ProfileWaveCollaborator[] = collaboratorEntries.map(({ profile }) => ({
        username: profile.username,
        displayName: profile.displayName ?? undefined,
        avatarUrl: profile.avatarUrl,
      }));

      return {
        wave,
        audioUrl,
        peaks: asset.peaks?.data ?? [],
        durationMs: asset.durationMs,
        collaborators,
      };
    }),
  );

  return hydrated.filter((entry): entry is ProfileWaveCard => entry !== null);
}

export interface ProfileWavesPage {
  items: ProfileWaveCard[];
  nextCursor: string | null;
}

export async function listProfileWaveCards(
  db: Db,
  admin: SupabaseClient<Database>,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileWavesPage> {
  const page: Page<Wave> = await listProfileWaves(db, profileId, params);
  return { items: await hydrateProfileWaves(db, admin, page.items), nextCursor: page.nextCursor };
}

export async function listProfileDuetCards(
  db: Db,
  admin: SupabaseClient<Database>,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileWavesPage> {
  const page: Page<Wave> = await listProfileDuets(db, profileId, params);
  return { items: await hydrateProfileWaves(db, admin, page.items), nextCursor: page.nextCursor };
}
