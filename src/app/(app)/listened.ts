/**
 * Which Waves on a page the viewer has already heard.
 *
 * `Signal` appears only where audio is live, and one of its five permitted
 * meanings is "the mark on unheard audio" (`docs/design/DESIGN.md` §4.1).
 * Home draws that mark, so it needs one batched read per page: the
 * `wave_listens` rows belonging to this viewer. RLS already restricts the
 * table to the caller's own listens, so the filter below is a narrowing, not
 * the authorization.
 *
 * `src/lib/db/*` is owned by another agent this wave, so this read lives
 * beside the screen that needs it rather than in the data layer; it is
 * read-only, takes the client as an argument like every helper in
 * `src/lib/db`, and never widens what the viewer can see.
 */

import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * The subset of `waveIds` this viewer has a recorded listen for. A failed
 * read degrades to "everything has been heard": a missing mark is quieter
 * than a wrong one, and the mark is decoration on top of the stream, never
 * the stream itself.
 */
export async function listHeardWaveIds(
  db: SupabaseServerClient,
  viewerId: string,
  waveIds: readonly string[],
): Promise<Set<string>> {
  if (waveIds.length === 0) {
    return new Set(waveIds);
  }

  const { data, error } = await db
    .from("wave_listens")
    .select("wave_id")
    .eq("listener_key", `u:${viewerId}`)
    .in("wave_id", [...waveIds]);

  if (error || !data) {
    return new Set(waveIds);
  }

  return new Set(data.map((row) => row.wave_id));
}
