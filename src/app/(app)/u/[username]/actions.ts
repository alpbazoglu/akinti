"use server";

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { blockProfile, unblockProfile } from "@/lib/db/blocks";
import { followProfile, respondToFollowRequest, unfollowProfile } from "@/lib/db/follows";
import { createReport } from "@/lib/db/reports";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import { blockSchema, followSchema, respondToFollowRequestSchema } from "@/lib/validation/profiles";
import { createReportSchema } from "@/lib/validation/moderation";
import type { FollowStatus } from "@/types/domain";

/** `follow`/`unfollow`/`cancelFollowRequest` also report the resulting edge
 *  status, so the client can show "Requested" instead of guessing whether a
 *  private target's follow landed as pending or accepted. */
export interface FollowActionResult extends AuthActionResult {
  status?: FollowStatus | null;
}

/**
 * Follow/block/report Server Actions for `/u/[username]` (spec §21, §26).
 * Every mutation here rides on RLS (`follows`/`blocks`/`reports` policies,
 * migration 12) — this file validates shape and gives an honest error
 * message, it is never the authorization boundary. Same `{ ok, fieldErrors,
 * formError, message }` contract as every other Server Action in the app
 * (`src/lib/auth/types.ts`), so callers never have to special-case this
 * domain.
 */

async function requireSignedInUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      result: {
        ok: false,
        formError: "You need to be signed in to do that.",
      } satisfies AuthActionResult,
    };
  }
  return { user, result: null };
}

/** Follow a profile, or send a follow request if it is private. Idempotent. */
export async function follow(followeeId: string): Promise<FollowActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = followSchema.safeParse({ followeeId });
  if (!parsed.success) {
    return { ok: false, formError: "That profile could not be found." };
  }
  if (parsed.data.followeeId === user.id) {
    return { ok: false, formError: "You cannot follow yourself." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    const status = await followProfile(supabase, user.id, parsed.data.followeeId);
    return { ok: true, status };
  } catch {
    return { ok: false, formError: "Could not follow this account. Try again." };
  }
}

export async function unfollow(followeeId: string): Promise<FollowActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = followSchema.safeParse({ followeeId });
  if (!parsed.success) {
    return { ok: false, formError: "That profile could not be found." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await unfollowProfile(supabase, user.id, parsed.data.followeeId);
  } catch {
    return { ok: false, formError: "Could not unfollow this account. Try again." };
  }
  return { ok: true, status: null };
}

/** A pending follow *request* is the same row as an accepted follow — cancelling deletes it. */
export async function cancelFollowRequest(followeeId: string): Promise<FollowActionResult> {
  return unfollow(followeeId);
}

/** Accept a follow request you received. Only the followee may do this (RLS `follows_update`). */
export async function acceptFollowRequest(followerId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = respondToFollowRequestSchema.safeParse({ followerId, accept: true });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await respondToFollowRequest(supabase, user.id, parsed.data.followerId, true);
  } catch {
    return { ok: false, formError: "Could not accept that request. Try again." };
  }
  return { ok: true };
}

export async function declineFollowRequest(followerId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = respondToFollowRequestSchema.safeParse({ followerId, accept: false });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await respondToFollowRequest(supabase, user.id, parsed.data.followerId, false);
  } catch {
    return { ok: false, formError: "Could not decline that request. Try again." };
  }
  return { ok: true };
}

/** Blocking severs follows and pending Duet requests in both directions (migration 12 trigger). */
export async function block(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = blockSchema.safeParse({ blockedId });
  if (!parsed.success) {
    return { ok: false, formError: "That profile could not be found." };
  }
  if (parsed.data.blockedId === user.id) {
    return { ok: false, formError: "You cannot block yourself." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await blockProfile(supabase, user.id, parsed.data.blockedId);
  } catch {
    return { ok: false, formError: "Could not block this account. Try again." };
  }
  return { ok: true, message: "Account blocked." };
}

export async function unblock(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = uuidSchema.safeParse(blockedId);
  if (!parsed.success) {
    return { ok: false, formError: "That profile could not be found." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await unblockProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not unblock this account. Try again." };
  }
  return { ok: true, message: "Account unblocked." };
}

export interface SubmitProfileReportInput {
  targetProfileId: string;
  reason: string;
  details: string | null;
}

/** File a report against a profile (spec §26). Never auto-actioned — lands in the moderation queue as `open`. */
export async function submitProfileReport(input: SubmitProfileReportInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = createReportSchema.safeParse({
    target_type: "profile",
    target_profile_id: input.targetProfileId,
    reason: input.reason,
    details: input.details,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await createReport(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not submit your report. Try again." };
  }
  return { ok: true, message: "Report submitted. Our team will review it." };
}
