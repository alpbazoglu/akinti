/**
 * `follows`: the social graph. A follow of a private profile starts `pending`
 * (spec s21); the `follows_before_insert` trigger decides the initial status
 * server-side, so this file never sets it directly.
 *
 * List helpers deliberately do a follows-then-profiles two-step instead of an
 * embedded `profiles!fk(*)` select: the hand-written `Database` type has no
 * literal foreign-key names for supabase-js to resolve embedding types
 * against, and two simple queries are easier to reason about than fighting
 * that inference.
 */

import type { FollowStatus, Page, Profile } from "@/types/domain";

import { getProfilesByIds } from "./profiles";
import type { Db } from "./types";
import {
  buildPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  keysetFilter,
  unwrap,
  unwrapMaybe,
} from "./types";

/** Send a follow (or follow request, for a private profile). Idempotent. */
export async function followProfile(
  db: Db,
  followerId: string,
  followeeId: string,
): Promise<FollowStatus> {
  const result = await db
    .from("follows")
    .upsert(
      { follower_id: followerId, followee_id: followeeId },
      { onConflict: "follower_id,followee_id" },
    )
    .select("status")
    .single();
  return unwrap("followProfile", result).status;
}

export async function unfollowProfile(db: Db, followerId: string, followeeId: string): Promise<void> {
  const result = await db
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (result.error) {
    throw result.error;
  }
}

/** Only the followee may accept or decline (RLS `follows_update`). Declining deletes the row. */
export async function respondToFollowRequest(
  db: Db,
  followeeId: string,
  followerId: string,
  accept: boolean,
): Promise<void> {
  if (!accept) {
    const result = await db
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("followee_id", followeeId);
    if (result.error) {
      throw result.error;
    }
    return;
  }
  const result = await db
    .from("follows")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
  if (result.error) {
    throw result.error;
  }
}

export async function getFollowStatus(
  db: Db,
  followerId: string,
  followeeId: string,
): Promise<FollowStatus | null> {
  const result = await db
    .from("follows")
    .select("status")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle();
  const row = unwrapMaybe("getFollowStatus", result);
  return row?.status ?? null;
}

export async function isFollowing(db: Db, followerId: string, followeeId: string): Promise<boolean> {
  const result = await db.rpc("is_following", { follower: followerId, followee: followeeId });
  return unwrap("isFollowing", result);
}

export async function areMutualFollowers(db: Db, a: string, b: string): Promise<boolean> {
  const result = await db.rpc("are_mutual_followers", { a, b });
  return unwrap("areMutualFollowers", result);
}

interface FollowEdge {
  otherId: string;
  createdAt: string;
}

async function hydrateEdges(db: Db, edges: FollowEdge[]): Promise<Profile[]> {
  if (edges.length === 0) {
    return [];
  }
  const profiles = await getProfilesByIds(
    db,
    edges.map((e) => e.otherId),
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));
  // Preserve edge order; drop any profile RLS/deletion hid from us.
  return edges.map((e) => byId.get(e.otherId)).filter((p): p is Profile => p !== undefined);
}

export async function listFollowers(
  db: Db,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Profile>> {
  const limit = clampLimit(params.limit);
  // `follows` has no surrogate id (its primary key is `(follower_id,
  // followee_id)`); scoped to one `followee_id` here, `follower_id` is
  // itself unique per row, so it is a valid tiebreaker for the
  // `(created_at, follower_id)` composite cursor.
  let query = db
    .from("follows")
    .select("follower_id, created_at")
    .eq("followee_id", profileId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .order("follower_id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "follower_id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listFollowers", { data: result.data ?? [], error: result.error });
  const edges = rows.map((r) => ({ otherId: r.follower_id, createdAt: r.created_at }));
  const page = buildPage(edges, limit, (e) => encodeCursor(e.createdAt, e.otherId));
  const profiles = await hydrateEdges(db, page.items);
  return { items: profiles, nextCursor: page.nextCursor };
}

export async function listFollowing(
  db: Db,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Profile>> {
  const limit = clampLimit(params.limit);
  // Scoped to one `follower_id` here, `followee_id` is itself unique per
  // row — the tiebreaker for the `(created_at, followee_id)` composite
  // cursor (see `listFollowers`).
  let query = db
    .from("follows")
    .select("followee_id, created_at")
    .eq("follower_id", profileId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .order("followee_id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "followee_id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listFollowing", { data: result.data ?? [], error: result.error });
  const edges = rows.map((r) => ({ otherId: r.followee_id, createdAt: r.created_at }));
  const page = buildPage(edges, limit, (e) => encodeCursor(e.createdAt, e.otherId));
  const profiles = await hydrateEdges(db, page.items);
  return { items: profiles, nextCursor: page.nextCursor };
}

/** Pending follow requests waiting on `profileId` (private-profile inbox). */
export async function listPendingFollowRequests(
  db: Db,
  profileId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Profile>> {
  const limit = clampLimit(params.limit);
  // Same tiebreaker as `listFollowers`: scoped to one `followee_id`,
  // `follower_id` is unique per row.
  let query = db
    .from("follows")
    .select("follower_id, created_at")
    .eq("followee_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("follower_id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "follower_id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listPendingFollowRequests", { data: result.data ?? [], error: result.error });
  const edges = rows.map((r) => ({ otherId: r.follower_id, createdAt: r.created_at }));
  const page = buildPage(edges, limit, (e) => encodeCursor(e.createdAt, e.otherId));
  const profiles = await hydrateEdges(db, page.items);
  return { items: profiles, nextCursor: page.nextCursor };
}
