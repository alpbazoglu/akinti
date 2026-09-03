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

/** True when `username` is free. Checked client-side for fast feedback; the
 *  unique index on `profiles.username` is the actual authority. */
export async function isUsernameAvailable(db: Db, username: string): Promise<boolean> {
  const result = await db
    .from("profiles")
    .select("id")
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();
  const row = unwrapMaybe("isUsernameAvailable", result);
  return row === null;
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
