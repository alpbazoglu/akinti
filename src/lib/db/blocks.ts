/**
 * `blocks`. Directional in storage, symmetric in effect — `is_blocked_between`
 * (migration 10) is what every other authorization check calls, never a raw
 * `blocks` row. Inserting a block also severs any follow/duet-request state in
 * both directions (see `blocks_after_insert` trigger, migration 12).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { Block, Profile } from "@/types/domain";

import { toProfile } from "./mappers";
import type { Db } from "./types";
import { unwrap, unwrapList } from "./types";

function toBlock(row: { blocker_id: string; blocked_id: string; created_at: string }): Block {
  return { blockerId: row.blocker_id, blockedId: row.blocked_id, createdAt: row.created_at };
}

export async function blockProfile(db: Db, blockerId: string, blockedId: string): Promise<void> {
  const result = await db
    .from("blocks")
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  if (result.error) {
    throw result.error;
  }
}

export async function unblockProfile(db: Db, blockerId: string, blockedId: string): Promise<void> {
  const result = await db
    .from("blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
  if (result.error) {
    throw result.error;
  }
}

/** Accounts `blockerId` has blocked. RLS restricts this to the caller's own list. */
export async function listBlockedProfiles(db: Db, blockerId: string): Promise<Block[]> {
  const result = await db
    .from("blocks")
    .select("*")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });
  const rows = unwrapList("listBlockedProfiles", result);
  return rows.map(toBlock);
}

export async function isBlockedBetween(db: Db, a: string, b: string): Promise<boolean> {
  const result = await db.rpc("is_blocked_between", { a, b });
  return unwrap("isBlockedBetween", result);
}

/**
 * The blocker's own blocked list, with each account's basic identity
 * (avatar, username, display name) hydrated for the Safety settings page
 * (spec §25/§26).
 *
 * `can_view_profile` (migration 10) treats a block as visibility-symmetric —
 * once a block exists in either direction, `profiles_select` hides the row
 * from BOTH parties, including the blocker themselves. That is correct for
 * "can a blocked stranger still browse me," but it also means an
 * RLS-scoped read can never render a blocker's own unblock list. This
 * function does not weaken that: `listBlockedProfiles` above already proves
 * (via `blocks_select_own`, `blocker_id = auth.uid()`) that the caller is
 * authorized to know these ids are blocked; `admin` is used only to fetch
 * basic identity for ids the caller is already provably authorized to know
 * about — never to discover a block relationship it didn't already have.
 * The cleaner long-term fix is an RLS predicate change (`can_view_profile`
 * special-casing "viewer is the blocker"); flagged to the schema owner
 * rather than written as a migration here (out of scope for this agent).
 */
export async function listBlockedProfilesWithIdentity(
  db: Db,
  admin: SupabaseClient<Database>,
  blockerId: string,
): Promise<Profile[]> {
  const blocks = await listBlockedProfiles(db, blockerId);
  if (blocks.length === 0) {
    return [];
  }
  const ids = blocks.map((b) => b.blockedId);
  const result = await admin.from("profiles").select("*").in("id", ids);
  const rows = unwrap("listBlockedProfilesWithIdentity", {
    data: result.data ?? [],
    error: result.error,
  });
  const byId = new Map(rows.map((row) => [row.id, toProfile(row)]));
  // Preserve `listBlockedProfiles`' most-recently-blocked-first order.
  return ids.map((id) => byId.get(id)).filter((p): p is Profile => p !== undefined);
}
