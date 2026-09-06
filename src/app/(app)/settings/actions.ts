"use server";

import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { unblockProfile } from "@/lib/db/blocks";
import { toComment, toWave } from "@/lib/db/mappers";
import { updateNotificationPreferences as updateNotificationPreferencesDb } from "@/lib/db/notifications";
import { getProfileById, isUsernameAvailable, updateProfile, updateProfileLocale } from "@/lib/db/profiles";
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";
import { DatabaseError } from "@/lib/db/types";
import type { AccountDataExport } from "@/lib/privacy/dataExport";
import { serializeAccountDataExport } from "@/lib/privacy/dataExport";
import { AUDIO_BUCKET, AVATAR_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteUserStorageObjects } from "@/lib/storage/userObjects";
import type { CommentRow, WaveRow } from "@/types/database";
import { routes } from "@/config/routes";
import { uuidSchema } from "@/lib/validation/common";
import { notificationPreferencesSchema } from "@/lib/validation/moderation";
import {
  deleteAccountSchema,
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

/**
 * Settings → language row (i18n infrastructure). Writes both signals the
 * resolution order in `src/i18n/locale.ts` reads: the `akinti_locale` cookie
 * (works signed out, and is the fast path — no round trip needed on the very
 * next request) and, for a signed-in user, `profiles.locale` (the strongest
 * signal, so the choice follows the account across devices/browsers). The
 * cookie write always happens, even when Supabase is unreachable, so the
 * switch still works without a configured backend.
 */
export async function setLocale(locale: AppLocale): Promise<AuthActionResult> {
  if (!isAppLocale(locale)) {
    return { ok: false, formError: "That language isn't available." };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const user = await getCurrentUser();
  if (user && isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    try {
      await updateProfileLocale(supabase, user.id, locale);
    } catch {
      // The cookie is already set, so the UI still switches language even if
      // the profile write fails — it just won't follow this account to
      // another device until it succeeds on a later attempt.
      return { ok: true, message: "Language updated on this device." };
    }
  }

  return { ok: true, message: "Language updated." };
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

export interface UpdateNotificationPreferencesFormInput {
  message?: boolean;
  duet?: boolean;
  comment?: boolean;
  follower?: boolean;
  system?: boolean;
}

/**
 * Settings → Notifications (spec §23, §25). A missing/undefined key means
 * "on" — the form only ever sends the keys the user has actually toggled
 * off from their current state, so this never has to first read-then-merge.
 * `push_notification()` (migration 22) is the actual enforcement point.
 */
export async function updateNotificationPreferences(
  input: UpdateNotificationPreferencesFormInput,
): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Could not save your notification preferences." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await updateNotificationPreferencesDb(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: "Could not save your notification preferences. Try again." };
  }

  return { ok: true, message: "Notification preferences saved." };
}

export interface ExportAccountDataResult extends AuthActionResult {
  data?: AccountDataExport;
}

/**
 * Settings → Safety → "Download my data" (spec §25/§26). A real export, not
 * a placeholder (spec §44 rule 9): the caller's own profile, Wave metadata
 * and comments, gathered through the caller's own RLS-scoped client (so
 * this can never return more than the account can already see of itself)
 * and shaped by the pure `serializeAccountDataExport`
 * (`src/lib/privacy/dataExport.ts`). The client turns `data` into a
 * downloadable `Blob` — a Server Action cannot hand back a `Blob` directly
 * across the RSC boundary, only serializable JSON.
 */
export async function exportAccountData(): Promise<ExportAccountDataResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const supabase = await createServerSupabaseClient();

  try {
    const profile = await getProfileById(supabase, user.id);
    if (!profile) {
      return { ok: false, formError: "Your account could not be found." };
    }

    const [wavesResult, commentsResult] = await Promise.all([
      supabase
        .from("waves")
        .select("*")
        .eq("creator_id", user.id)
        .is("deleted_at", null)
        .order("published_at", { ascending: false }),
      supabase
        .from("comments")
        .select("*")
        .eq("author_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);
    if (wavesResult.error) throw wavesResult.error;
    if (commentsResult.error) throw commentsResult.error;

    const waves = ((wavesResult.data ?? []) as WaveRow[]).map(toWave);
    const comments = ((commentsResult.data ?? []) as CommentRow[]).map(toComment);

    const data = serializeAccountDataExport({ profile, waves, comments });
    return { ok: true, data };
  } catch {
    return { ok: false, formError: "Could not prepare your data export. Try again." };
  }
}

export interface DeleteAccountFormInput {
  /** The account's own handle, retyped as the confirmation (SCREENS.md §11). */
  confirmHandle: string;
}

/**
 * Settings → delete account (SCREENS.md §11, DESIGN.md §11.2). Retyping the
 * caller's own handle IS the confirmation, checked against their real
 * username here — never trusted from the client beyond that.
 *
 * Deletes the `auth.users` row through the service-role admin client, the
 * same "admin path, only after an authorization check" this client is
 * already scoped to (`src/lib/supabase/admin.ts`) — the authorization here
 * is simply that a signed-in user can only ever delete themselves
 * (`user.id` comes from the verified session, never from the form).
 * `profiles.id references auth.users(id) on delete cascade`
 * (`20260903120200_identity_and_social_graph.sql`) takes every dependent row
 * (Waves, Duets, comments, messages) from there — the same cascade path
 * `e2e/helpers/supabaseAdmin.ts#deleteTestUser` already exercises for every
 * live-backend e2e spec's cleanup. No new migration needed.
 *
 * The cascade only takes database rows, never the account's Storage
 * objects: nothing else references the private `audio` bucket or
 * `avatars/<uid>/` once the `audio_assets`/`profiles` rows are gone, so
 * every recording would otherwise be retained indefinitely with no row
 * pointing at it. `deleteUserStorageObjects` (`src/lib/storage/userObjects.ts`)
 * removes both buckets' objects for this account first — the same
 * admin-client storage cleanup `deleteWaveDetails` (`w/[id]/actions.ts`)
 * already does per Wave — and if that fails, the account is NOT deleted;
 * an orphaned account is recoverable, silently-retained audio is not.
 */
export async function deleteAccount(input: DeleteAccountFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = deleteAccountSchema.safeParse({ confirmHandle: input.confirmHandle });
  if (!parsed.success) {
    return { ok: false, fieldErrors: { confirmHandle: "Type your handle to confirm." } };
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);
  if (!profile || parsed.data.confirmHandle !== profile.username) {
    return { ok: false, fieldErrors: { confirmHandle: "That doesn't match your handle." } };
  }

  const admin = createAdminClient();

  try {
    await Promise.all([
      deleteUserStorageObjects(admin.storage.from(AUDIO_BUCKET), user.id),
      deleteUserStorageObjects(admin.storage.from(AVATAR_BUCKET), user.id),
    ]);
  } catch (err) {
    console.error("[settings/actions] storage cleanup before account delete failed:", err);
    return { ok: false, formError: "Could not delete your account. Try again." };
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch {
    return { ok: false, formError: "Could not delete your account. Try again." };
  }

  return { ok: true, redirectTo: routes.login() };
}
