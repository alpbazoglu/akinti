"use server";

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { unblockProfile } from "@/lib/db/blocks";
import { isUsernameAvailable, updateProfile } from "@/lib/db/profiles";
import { DatabaseError } from "@/lib/db/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import {
  updateAccountSchema,
  updateAppearanceSchema,
  updateAvatarSchema,
  updatePrivacySchema,
} from "@/lib/validation/profiles";

/**
 * Settings Server Actions (spec §25). Every action here validates with Zod,
 * never throws to the client, and returns the same `{ ok, fieldErrors,
 * formError, message }` contract as `src/app/(auth)/actions.ts`. The real
 * authorization boundary is `profiles_update_own` (RLS, migration 12: `id =
 * auth.uid()`) — these actions never need to check ownership themselves,
 * `updateProfile` scopes every write to the caller's own row.
 */

async function requireSignedInUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      result: {
        ok: false,
        formError: "Your session has expired. Sign in again to continue.",
      } satisfies AuthActionResult,
    };
  }
  return { user, result: null };
}

export interface UpdateAccountFormInput {
  username: string;
  displayName: string | null;
  bio: string | null;
}

/** Settings → Account: display name, username (uniqueness-checked), bio. */
export async function updateAccount(input: UpdateAccountFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = updateAccountSchema.safeParse({
    username: input.username,
    display_name: input.displayName,
    bio: input.bio,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();

  if (!(await isUsernameAvailable(supabase, parsed.data.username, user.id))) {
    return { ok: false, fieldErrors: { username: "That username is taken." } };
  }

  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      return { ok: false, fieldErrors: { username: "That username is taken." } };
    }
    return { ok: false, formError: "Could not save your changes. Try again." };
  }

  return { ok: true, message: "Account details saved." };
}

/** Settings → Account: avatar. `avatarUrl` is already a public URL in the `avatars` bucket
 *  (spec §33) — the client resizes and uploads directly via the owner-write storage
 *  policy (migration 13) before calling this to persist it on the profile row. */
export async function updateAvatar(avatarUrl: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = updateAvatarSchema.safeParse({ avatar_url: avatarUrl });
  if (!parsed.success) {
    return { ok: false, formError: "That image could not be saved. Try again." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not save your new photo. Try again." };
  }

  return { ok: true, message: "Profile photo updated." };
}

export interface UpdatePrivacyFormInput {
  privacy: string;
  messagePermission: string;
  duetPermission: string;
  commentPermission: string;
  defaultWaveVisibility: string;
}

/** Settings → Privacy: public/private + every permission default (spec §25). */
export async function updatePrivacy(input: UpdatePrivacyFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = updatePrivacySchema.safeParse({
    privacy: input.privacy,
    message_permission: input.messagePermission,
    duet_permission: input.duetPermission,
    comment_permission: input.commentPermission,
    default_wave_visibility: input.defaultWaveVisibility,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    // Switching to private keeps existing followers (spec §25) — this is a
    // plain column update; `follows` rows are untouched either direction.
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not save your privacy settings. Try again." };
  }

  return { ok: true, message: "Privacy settings saved." };
}

export interface UpdateAppearanceFormInput {
  bgColor: string;
  bgGradient: string;
  bgPattern: string;
  accentColor: string;
}

/** Settings → Appearance: curated theme presets only (spec §21). */
export async function updateAppearance(input: UpdateAppearanceFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = updateAppearanceSchema.safeParse({
    bg_color: input.bgColor,
    bg_gradient: input.bgGradient,
    bg_pattern: input.bgPattern,
    accent_color: input.accentColor,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not save your appearance settings. Try again." };
  }

  return { ok: true, message: "Appearance saved." };
}

/** Settings → Safety: unblock. Deleting the `blocks` row does not restore any severed follow. */
export async function unblockUser(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = uuidSchema.safeParse(blockedId);
  if (!parsed.success) {
    return { ok: false, formError: "That account could not be found." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await unblockProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not unblock this account. Try again." };
  }

  return { ok: true, message: "Account unblocked." };
}
