/**
 * Profile-page Wave hydration (spec §21 — Waves/Duets tabs).
 *
 * `src/lib/db/waves.ts` (owned by the waves agent) already exports
 * `listProfileWaves`/`listProfileDuets`, which is all the *querying* this
 * page needs. What it doesn't do is turn a bare `Wave` into something a
 * `WaveCardContainer` can render — decoded peaks and accepted collaborator
 * profiles. This file only composes existing exports (`waves.ts`,
 * `audioAssets.ts`) via the Supabase client directly, per the "thin helper in
 * profileWaves.ts" guidance for the profiles agent — it does not duplicate
 * any authorization or query logic those files already own.
 *
 * Stage 14 audit (spec §35 — performance): this used to call
 * `mintSignedAudioUrl` for every Wave on the page, up front, on every render
 * — one Supabase Storage round trip per card before the profile page could
 * even respond, exactly the "load all audio assets on a page at once" the
 * spec says not to do. It now only hands back `audioAssetId`, matching
 * `src/lib/interactions/contentLists.ts` (Settings → Content's four tabs,
 * which never had this problem): the page renders
 * `WaveCardContainer`/`WaveCard`, which resolves a signed URL itself, lazily,
 * on first play (`GET /api/audio/[assetId]/url`) — never eagerly, never
 * server-side. No admin client is needed here any more as a result.
 */

import { getAudioAssetById } from "./audioAssets";
import { listProfileDuets, listProfileWaves, listWaveCollaboratorProfiles } from "./waves";
import type { Db } from "./types";
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
  /** `audio_assets.id` — resolved to a signed URL lazily on first play, never here. */
  audioAssetId: string;
  peaks: readonly number[];
  durationMs: number | null;
  collaborators: ProfileWaveCollaborator[];
}

/**
 * Attach peaks and collaborator profiles to a page of Waves. Any Wave whose
 * audio asset can't be read (in practice: never, since
 * `listProfileWaves`/`listProfileDuets` already filtered by `can_view_wave`)
 * is dropped rather than crashing the whole tab — a Wave card with no
 * waveform is a worse experience than one fewer card.
 */
export async function hydrateProfileWaves(db: Db, waves: readonly Wave[]): Promise<ProfileWaveCard[]> {
  const hydrated = await Promise.all(
    waves.map(async (wave): Promise<ProfileWaveCard | null> => {
      const asset = await getAudioAssetById(db, wave.audioAssetId);
      if (!asset) {
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
        audioAssetId: wave.audioAssetId,
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
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileWavesPage> {
  const page: Page<Wave> = await listProfileWaves(db, profileId, params);
  return { items: await hydrateProfileWaves(db, page.items), nextCursor: page.nextCursor };
}

export async function listProfileDuetCards(
  db: Db,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileWavesPage> {
  const page: Page<Wave> = await listProfileDuets(db, profileId, params);
  return { items: await hydrateProfileWaves(db, page.items), nextCursor: page.nextCursor };
}
