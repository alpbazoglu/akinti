/**
 * Search (spec s24): "v1 can be simple and deterministic ... Architect it so
 * a dedicated search index can be swapped in without touching calling code."
 *
 * The actual reads already exist — `search_profiles`/`search_waves`
 * (migration `20260903121400_search.sql`) via `profiles.ts#searchProfiles`
 * and `waves.ts#searchWaves` — trigram matching today. This file adds the
 * swap seam the spec asks for: `SearchProvider` is the interface call sites
 * depend on; `trigramSearchProvider` is the only implementation right now.
 * Replacing trigram with Postgres full-text search or an external index
 * later means writing a new `SearchProvider` and changing one binding here
 * — `/search` (`src/app/(app)/search/page.tsx`) never imports
 * `profiles.ts`/`waves.ts` directly.
 */

import { searchProfiles as searchProfilesRow } from "./profiles";
import type { Db } from "./types";
import { searchWaves as searchWavesRow } from "./waves";

import type { Profile, Wave } from "@/types/domain";

export interface SearchParams {
  query: string;
  limit?: number;
  offset?: number;
}

/**
 * The seam a future search backend implements. Both methods take the RLS-
 * scoped client as their first argument, exactly like every other
 * `src/lib/db/**` helper — a private profile or Wave can never surface here
 * regardless of implementation, since RLS (not this interface) is the
 * authorization boundary (spec s24, s32).
 */
export interface SearchProvider {
  searchProfiles(db: Db, params: SearchParams): Promise<Profile[]>;
  searchWaves(db: Db, params: SearchParams): Promise<Wave[]>;
}

/** Today's implementation: Postgres trigram matching (migration 14). */
export const trigramSearchProvider: SearchProvider = {
  searchProfiles: (db, params) => searchProfilesRow(db, params.query, params.limit, params.offset ?? 0),
  searchWaves: (db, params) => searchWavesRow(db, params.query, params.limit, params.offset ?? 0),
};

/** The active provider. Swap this binding to change the search backend everywhere at once. */
export const searchProvider: SearchProvider = trigramSearchProvider;

export async function searchProfiles(db: Db, params: SearchParams): Promise<Profile[]> {
  return searchProvider.searchProfiles(db, params);
}

export async function searchWaves(db: Db, params: SearchParams): Promise<Wave[]> {
  return searchProvider.searchWaves(db, params);
}

export interface SearchAllResult {
  profiles: Profile[];
  waves: Wave[];
}

/** `/search?q=` (spec s24): both lanes in one round trip. */
export async function searchAll(db: Db, params: SearchParams): Promise<SearchAllResult> {
  const [profiles, waves] = await Promise.all([
    searchProvider.searchProfiles(db, params),
    searchProvider.searchWaves(db, params),
  ]);
  return { profiles, waves };
}
