/**
 * Creator discovery reads that don't belong to any one domain table —
 * `rising_creators()` (migration 18) aggregates across `follows` and `waves`,
 * so it lives here rather than bolted onto `profiles.ts` or `waves.ts`.
 *
 * Explore -> "Rising creators" (spec s10) is the only caller today.
 */

import type { FollowStatus, Profile } from "@/types/domain";

import { toProfile } from "./mappers";
import type { Db } from "./types";
import { clampLimit, unwrap } from "./types";

export interface RisingCreatorsParams {
  limit?: number;
  offset?: number;
  /** How far back "recent" reaches, in hours. Defaults to 7 days. */
  windowHours?: number;
}

/** Explore -> Rising (spec s10): public creators with recent follower growth or a recent first Wave. */
export async function getRisingCreators(db: Db, params: RisingCreatorsParams = {}): Promise<Profile[]> {
  const result = await db.rpc("rising_creators", {
    p_limit: clampLimit(params.limit),
    p_offset: Math.max(0, params.offset ?? 0),
    p_window_hours: params.windowHours ?? 168,
  });
  const rows = unwrap("getRisingCreators", { data: result.data ?? [], error: result.error });
  return rows.map(toProfile);
}

export interface FollowEdge {
  /** The viewer's own follow status toward this creator; `null` when not following. */
  status: FollowStatus | null;
  /** Whether this creator follows the viewer back — feeds `FollowButton`'s "Follow back" label. */
  followsViewer: boolean;
}

/**
 * Both directions of the viewer/creator follow edge for a batch of creators,
 * in two queries total rather than one `is_following`/`getFollowStatus` RPC
 * round trip per creator — used to hydrate the "Rising creators" strip's
 * `FollowButton`s (spec s35: no N+1 per card).
 */
export async function getFollowEdgesForViewer(
  db: Db,
  viewerId: string,
  creatorIds: string[],
): Promise<Map<string, FollowEdge>> {
  const edges = new Map<string, FollowEdge>();
  if (creatorIds.length === 0) {
    return edges;
  }

  const [outgoing, incoming] = await Promise.all([
    db.from("follows").select("followee_id, status").eq("follower_id", viewerId).in("followee_id", creatorIds),
    db
      .from("follows")
      .select("follower_id")
      .eq("followee_id", viewerId)
      .eq("status", "accepted")
      .in("follower_id", creatorIds),
  ]);

  const outgoingRows = unwrap("getFollowEdgesForViewer:outgoing", {
    data: outgoing.data ?? [],
    error: outgoing.error,
  });
  const incomingRows = unwrap("getFollowEdgesForViewer:incoming", {
    data: incoming.data ?? [],
    error: incoming.error,
  });
  const followsViewerIds = new Set(incomingRows.map((r) => r.follower_id));

  for (const creatorId of creatorIds) {
    edges.set(creatorId, { status: null, followsViewer: followsViewerIds.has(creatorId) });
  }
  for (const row of outgoingRows) {
    edges.set(row.followee_id, {
      status: row.status,
      followsViewer: followsViewerIds.has(row.followee_id),
    });
  }
  return edges;
}
