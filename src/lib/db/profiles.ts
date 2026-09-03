/**
 * Profile reads/writes.
 *
 * Follow/block relationships live in `follows.ts` / `blocks.ts` — this file is
 * only the `profiles` table itself and the search RPC.
 */

import type {
  CompleteOnboardingInput,
  UpdateProfileInput,
} from "@/lib/validation/profiles";
import type { Profile } from "@/types/domain";

import { toProfile } from "./mappers";
import type { Db } from "./types";
import { clampLimit, unwrap, unwrapMaybe } from "./types";

export async function getProfileById(db: Db, profileId: string): Promise<Profile | null> {
  const result = await db.from("profiles").select("*").eq("id", profileId).maybeSingle();
  const row = unwrapMaybe("getProfileById", result);
  return row ? toProfile(row) : null;
}

export async function getProfileByUsername(db: Db, username: string): Promise<Profile | null> {
  const result = await db
    .from("profiles")
    .select("*")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  const row = unwrapMaybe("getProfileByUsername", result);
  return row ? toProfile(row) : null;
}

export async function getProfilesByIds(db: Db, profileIds: string[]): Promise<Profile[]> {
  if (profileIds.length === 0) {
    return [];
  }
  const result = await db.from("profiles").select("*").in("id", profileIds);
  const rows = unwrap("getProfilesByIds", { data: result.data ?? [], error: result.error });
  return rows.map(toProfile);
}

/** The signed-in user updates their own profile. RLS also enforces `id = auth.uid()`. */
export async function updateProfile(
  db: Db,
  profileId: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const result = await db
    .from("profiles")
    .update(input)
    .eq("id", profileId)
    .select("*")
    .single();
  return toProfile(unwrap("updateProfile", result));
}

/** Step 2 of onboarding (spec s8): claim a real username, optionally seed interests. */
export async function completeOnboarding(
  db: Db,
  profileId: string,
  input: CompleteOnboardingInput,
): Promise<Profile> {
  const result = await db
    .from("profiles")
    .update({
      username: input.username,
      display_name: input.display_name,
      interests: input.interests,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select("*")
    .single();
  return toProfile(unwrap("completeOnboarding", result));
}

/**
 * True when `username` is free. Checked client-side for fast feedback; the
 * unique index on `profiles.username` is the actual authority.
 *
 * `excludeProfileId` lets an existing account re-submit its own current
 * username (e.g. saving the Account settings form without changing it)
 * without the check reporting a collision against itself.
 */
export async function isUsernameAvailable(
  db: Db,
  username: string,
  excludeProfileId?: string,
): Promise<boolean> {
  let query = db
    .from("profiles")
    .select("id")
    .eq("username", username.trim().toLowerCase());
  if (excludeProfileId) {
    query = query.neq("id", excludeProfileId);
  }
  const result = await query.maybeSingle();
  const row = unwrapMaybe("isUsernameAvailable", result);
  return row === null;
}

/**
 * A handful of public profiles to suggest during onboarding step 4 (spec
 * s8). Deliberately simple — most-followed public accounts, excluding the
 * viewer — matching the "deterministic, explainable" ranking philosophy the
 * spec asks for everywhere else (spec s10) rather than reaching for anything
 * ML-shaped this early.
 */
export async function listSuggestedCreators(db: Db, viewerId: string, limit = 6): Promise<Profile[]> {
  const result = await db
    .from("profiles")
    .select("*")
    .eq("privacy", "public")
    .neq("id", viewerId)
    .order("follower_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));
  const rows = unwrap("listSuggestedCreators", { data: result.data ?? [], error: result.error });
  return rows.map(toProfile);
}

/**
 * Whether the caller may see `profileId`'s *content* (Waves, follower list) —
 * stricter than `profiles_select`'s identity-card visibility, since a
 * private account's Waves stay locked until the caller is an accepted
 * follower (spec s21). Thin wrapper over `can_view_profile_content`
 * (migration 10), the single source of truth RLS itself uses.
 */
export async function canViewProfileContent(db: Db, profileId: string): Promise<boolean> {
  const result = await db.rpc("can_view_profile_content", { p_profile_id: profileId });
  return unwrap("canViewProfileContent", result);
}

/** Deterministic trigram search over username + display name (spec s24). */
export async function searchProfiles(
  db: Db,
  query: string,
  limit?: number,
  offset = 0,
): Promise<Profile[]> {
  const result = await db.rpc("search_profiles", {
    p_query: query,
    p_limit: clampLimit(limit),
    p_offset: Math.max(0, offset),
  });
  const rows = unwrap("searchProfiles", { data: result.data ?? [], error: result.error });
  return rows.map(toProfile);
}
