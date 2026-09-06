"use server";

import { getTranslations } from "next-intl/server";

import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { blockProfile, unblockProfile } from "@/lib/db/blocks";
import { followProfile, respondToFollowRequest, unfollowProfile } from "@/lib/db/follows";
import { mapModerationError } from "@/lib/moderation/errors";
import { createReport } from "@/lib/db/reports";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import { blockSchema, followSchema, respondToFollowRequestSchema } from "@/lib/validation/profiles";
import { createReportSchema } from "@/lib/validation/moderation";
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";
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
    const t = await getTranslations("ProfileActions");
    return {
      user: null,
      result: {
        ok: false,
        formError: t("signInRequired"),
      } satisfies AuthActionResult,
    };
  }
  // Server Action suspension guard (spec §26, §32, Stage 14 audit) —
  // `requireUser`'s redirect-based check only runs at page-load time; a
  // Server Action reached directly (a stale tab, or a client bypassing the
  // UI) never goes through it, so every mutation here re-checks itself.
  if (!(await assertNotSuspended(user.id))) {
    return {
      user: null,
      result: { ok: false, formError: SUSPENDED_ACTION_MESSAGE } satisfies AuthActionResult,
    };
  }
  return { user, result: null };
}

/** Follow a profile, or send a follow request if it is private. Idempotent. */
export async function follow(followeeId: string): Promise<FollowActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = followSchema.safeParse({ followeeId });
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, formError: t("ProfileActions.profileNotFound") };
  }
  if (parsed.data.followeeId === user.id) {
    return { ok: false, formError: t("ProfileActions.cannotFollowSelf") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    const status = await followProfile(supabase, user.id, parsed.data.followeeId);
    return { ok: true, status };
  } catch (err) {
    return { ok: false, formError: mapModerationError(err, t("ProfileActions.followFailed"), t) };
  }
}

export async function unfollow(followeeId: string): Promise<FollowActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = followSchema.safeParse({ followeeId });
  const t = await getTranslations("ProfileActions");
  if (!parsed.success) {
    return { ok: false, formError: t("profileNotFound") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await unfollowProfile(supabase, user.id, parsed.data.followeeId);
  } catch {
    return { ok: false, formError: t("unfollowFailed") };
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
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await respondToFollowRequest(supabase, user.id, parsed.data.followerId, true);
  } catch {
    return { ok: false, formError: t("ProfileActions.acceptRequestFailed") };
  }
  return { ok: true };
}

export async function declineFollowRequest(followerId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = respondToFollowRequestSchema.safeParse({ followerId, accept: false });
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await respondToFollowRequest(supabase, user.id, parsed.data.followerId, false);
  } catch {
    return { ok: false, formError: t("ProfileActions.declineRequestFailed") };
  }
  return { ok: true };
}

/** Blocking severs follows and pending Duet requests in both directions (migration 12 trigger). */
export async function block(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = blockSchema.safeParse({ blockedId });
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, formError: t("ProfileActions.profileNotFound") };
  }
  if (parsed.data.blockedId === user.id) {
    return { ok: false, formError: t("ProfileActions.cannotBlockSelf") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await blockProfile(supabase, user.id, parsed.data.blockedId);
  } catch {
    return { ok: false, formError: t("ProfileActions.blockFailed") };
  }
  return { ok: true, message: t("ProfileActions.blocked") };
}

export async function unblock(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = uuidSchema.safeParse(blockedId);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, formError: t("ProfileActions.profileNotFound") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await unblockProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("Common.unblockFailed") };
  }
  return { ok: true, message: t("Common.accountUnblocked") };
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
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await createReport(supabase, user.id, parsed.data);
  } catch (err) {
    return { ok: false, formError: mapModerationError(err, t("ProfileActions.reportFailed"), t) };
  }
  return { ok: true, message: t("ProfileActions.reportSubmitted") };
}
