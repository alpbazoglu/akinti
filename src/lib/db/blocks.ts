/**
 * `blocks`. Directional in storage, symmetric in effect — `is_blocked_between`
 * (migration 10) is what every other authorization check calls, never a raw
 * `blocks` row. Inserting a block also severs any follow/duet-request state in
 * both directions (see `blocks_after_insert` trigger, migration 12).
 */

import type { Block } from "@/types/domain";

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
