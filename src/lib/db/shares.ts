/**
 * `shares`. A share NEVER widens a Wave's visibility (spec s14) — the shared
 * link/message is resolved through `can_view_wave()` like any other read, so
 * a share row is just an engagement record, not an access grant.
 */

import type { ShareWaveInput } from "@/lib/validation/waves";
import type { Page, Share } from "@/types/domain";

import { toShare } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, decodeCursor, encodeCursor, keysetFilter, unwrap } from "./types";

export async function shareWave(db: Db, sharerId: string, input: ShareWaveInput): Promise<Share> {
  const result = await db
    .from("shares")
    .insert({
      wave_id: input.waveId,
      sharer_id: sharerId,
      channel: input.channel,
      conversation_id: input.conversationId,
    })
    .select("*")
    .single();
  return toShare(unwrap("shareWave", result));
}

/** Visible to the sharer and to the Wave's creator (RLS `shares_select`). */
export async function listWaveShares(
  db: Db,
  waveId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Share>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("shares")
    .select("*")
    .eq("wave_id", waveId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listWaveShares", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toShare), nextCursor: page.nextCursor };
}
