"use server";

/**
 * Server Action backing `/search?q=` (spec s24). Same `{ ok, data?, error? }`
 * contract as every other Server Action in the app — never throws to the
 * client (spec s38). Public: no `requireUser`, matching Explore — an
 * anonymous searcher gets exactly the RLS-visible slice (`everyone` Waves,
 * public/viewable profiles), never a special-cased query.
 */

import type { WaveCardContainerWave } from "@/components/wave";
import { getCurrentUser } from "@/lib/auth/server";
import { searchAll } from "@/lib/db/search";
import { hydrateWaveCards } from "@/lib/feed";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/domain";

export interface SearchResults {
  profiles: Profile[];
  waves: WaveCardContainerWave[];
}

export interface SearchActionResult {
  ok: boolean;
  data?: SearchResults;
  error?: string;
}

const SEARCH_RESULT_LIMIT = 20;

export async function runSearch(query: string): Promise<SearchActionResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { ok: true, data: { profiles: [], waves: [] } };
  }

  try {
    const user = await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const { profiles, waves } = await searchAll(supabase, { query: trimmed, limit: SEARCH_RESULT_LIMIT });
    const waveCards = await hydrateWaveCards(supabase, waves, user?.id ?? null);
    return { ok: true, data: { profiles, waves: waveCards } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
