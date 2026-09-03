/**
 * `saves` (bookmarks). Private to the saver by RLS — only the aggregate
 * `waves.save_count` is public (spec s14).
 */

import type { Page, Wave } from "@/types/domain";

import { toWave } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, unwrap, unwrapMaybe } from "./types";

export async function saveWave(db: Db, profileId: string, waveId: string): Promise<void> {
  const result = await db
    .from("saves")
    .upsert({ profile_id: profileId, wave_id: waveId }, { onConflict: "profile_id,wave_id" });
  if (result.error) {
    throw result.error;
  }
}

export async function unsaveWave(db: Db, profileId: string, waveId: string): Promise<void> {
  const result = await db.from("saves").delete().eq("profile_id", profileId).eq("wave_id", waveId);
  if (result.error) {
    throw result.error;
  }
}

export async function isWaveSaved(db: Db, profileId: string, waveId: string): Promise<boolean> {
  const result = await db
    .from("saves")
    .select("wave_id")
    .eq("profile_id", profileId)
    .eq("wave_id", waveId)
    .maybeSingle();
  return unwrapMaybe("isWaveSaved", result) !== null;
}

/** Profile → Saved (spec s14/s25). Two-step: save rows, then their Waves. */
export async function listSavedWaves(
  db: Db,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Wave>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("saves")
    .select("wave_id, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.lt("created_at", params.cursor);
  }
  const result = await query;
  const rows = unwrap("listSavedWaves", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => r.created_at);

  if (page.items.length === 0) {
    return { items: [], nextCursor: page.nextCursor };
  }
  const waveIds = page.items.map((r) => r.wave_id);
  const wavesResult = await db.from("waves").select("*").in("id", waveIds).is("deleted_at", null);
  const waveRows = unwrap("listSavedWaves:waves", { data: wavesResult.data ?? [], error: wavesResult.error });
  const byId = new Map(waveRows.map((w) => [w.id, toWave(w)]));
  // Preserve save order; a Wave the saver could no longer see is skipped.
  const items = page.items.map((r) => byId.get(r.wave_id)).filter((w): w is Wave => w !== undefined);
  return { items, nextCursor: page.nextCursor };
}
