"use server";

/**
 * Server Actions for `/explore` (spec s10). Same `{ ok, data?, error? }`
 * contract as every other Server Action in the app — never throws to the
 * client (spec s38). Explore is public (spec s10: "public for anonymous
 * users"), so nothing here calls `requireUser`; `getCurrentUser()` degrades
 * to `null` for a signed-out viewer, and every read still rides on RLS, so an
 * anonymous caller only ever sees `visibility = 'everyone'` Waves regardless
 * of what this file does or doesn't filter for.
 */

import type { WaveCardContainerWave } from "@/components/wave";
import { getCurrentUser } from "@/lib/auth/server";
import { getFollowEdgesForViewer, getRisingCreators, type FollowEdge } from "@/lib/db/discovery";
import {
  listNewWaves,
  listOpenForDuet,
  listOriginalWaves,
  listTrendingWaves,
  listWavesByCreatorIds,
  listWavesByTags,
} from "@/lib/db/waves";
import type { Db } from "@/lib/db/types";
import {
  decodeOffsetCursor,
  hydrateWaveCards,
  nextOffsetCursor,
  tagsForCategory,
  type ExploreCategory,
} from "@/lib/feed";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FollowStatus, Page, Profile, Wave } from "@/types/domain";

export interface FeedActionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const CATEGORY_PAGE_SIZE = 10;
/**
 * How many rising creators to pool before paginating their Waves by time.
 * Larger than the "Rising creators" strip's display count (spec s10's
 * creators strip shows far fewer) — this is the candidate set the "Rising"
 * *Wave* tab draws from, recomputed per page rather than cached, which is
 * fine at this scale (spec s10: deterministic, not real-time-critical).
 */
const RISING_CREATOR_POOL_SIZE = 60;

async function fetchCategoryPage(
  db: Db,
  category: ExploreCategory,
  cursor: string | null,
): Promise<Page<Wave>> {
  switch (category) {
    case "trending": {
      const offset = decodeOffsetCursor(cursor);
      const items = await listTrendingWaves(db, { limit: CATEGORY_PAGE_SIZE, offset });
      const hasMore = items.length >= CATEGORY_PAGE_SIZE;
      return { items, nextCursor: nextOffsetCursor(offset, items.length, hasMore) };
    }
    case "new":
      return listNewWaves(db, { limit: CATEGORY_PAGE_SIZE, cursor });
    case "rising": {
      const risingCreators = await getRisingCreators(db, { limit: RISING_CREATOR_POOL_SIZE });
      return listWavesByCreatorIds(
        db,
        risingCreators.map((c) => c.id),
        { limit: CATEGORY_PAGE_SIZE, cursor },
      );
    }
    case "original":
      return listOriginalWaves(db, { limit: CATEGORY_PAGE_SIZE, cursor });
    case "voices":
    case "compositions":
      return listWavesByTags(db, tagsForCategory(category), { limit: CATEGORY_PAGE_SIZE, cursor });
    case "open_for_duet":
      return listOpenForDuet(db, { limit: CATEGORY_PAGE_SIZE, cursor });
    default: {
      const exhaustive: never = category;
      throw new Error(`Unknown Explore category: ${String(exhaustive)}`);
    }
  }
}

/** A page of one Explore category's Wave list (spec s10). */
export async function loadExploreCategory(
  category: ExploreCategory,
  cursor: string | null,
): Promise<FeedActionResult<Page<WaveCardContainerWave>>> {
  try {
    const user = await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const page = await fetchCategoryPage(supabase, category, cursor);
    const items = await hydrateWaveCards(supabase, page.items, user?.id ?? null);
    return { ok: true, data: { items, nextCursor: page.nextCursor } };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export interface RisingCreatorCard {
  profile: Profile;
  followStatus: FollowStatus | null;
  followsViewer: boolean;
}

/** The "Rising creators" strip's data, refreshed after a follow/unfollow (spec s10). */
export async function loadRisingCreators(): Promise<FeedActionResult<RisingCreatorCard[]>> {
  try {
    const user = await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const creators = await getRisingCreators(supabase, { limit: 10 });
    const edges: Map<string, FollowEdge> = user
      ? await getFollowEdgesForViewer(
          supabase,
          user.id,
          creators.map((c) => c.id),
        )
      : new Map();
    const data = creators.map((profile) => ({
      profile,
      followStatus: edges.get(profile.id)?.status ?? null,
      followsViewer: edges.get(profile.id)?.followsViewer ?? false,
    }));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}
