"use server";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/auth/server";
import { cancelSubscriptionForUser } from "@/lib/billing";
import { getLatestSubscriptionForUser } from "@/lib/billing/repository";
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
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";

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
    const t = await getTranslations("Common");
    return {
      user: null,
      result: {
        ok: false,
        formError: t("sessionExpired"),
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
    const t = (await getTranslations()) as MessageTranslator;
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  const t = (await getTranslations()) as MessageTranslator;

  if (!(await isUsernameAvailable(supabase, parsed.data.username, user.id))) {
    return { ok: false, fieldErrors: { username: t("Common.usernameTaken") } };
  }

  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      return { ok: false, fieldErrors: { username: t("Common.usernameTaken") } };
    }
    return { ok: false, formError: t("SettingsActions.saveFailed") };
  }

  return { ok: true, message: t("SettingsActions.accountSaved") };
}

/** Settings → Account: avatar. `avatarUrl` is already a public URL in the `avatars` bucket
 *  (spec §33) — the client resizes and uploads directly via the owner-write storage
 *  policy (migration 13) before calling this to persist it on the profile row. */
export async function updateAvatar(avatarUrl: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = updateAvatarSchema.safeParse({ avatar_url: avatarUrl });
  const t = await getTranslations("SettingsActions");
  if (!parsed.success) {
    return { ok: false, formError: t("avatarInvalid") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("avatarSaveFailed") };
  }

  return { ok: true, message: t("avatarSaved") };
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
    const t = (await getTranslations()) as MessageTranslator;
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  const t = await getTranslations("SettingsActions");
  try {
    // Switching to private keeps existing followers (spec §25) — this is a
    // plain column update; `follows` rows are untouched either direction.
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("privacySaveFailed") };
  }

  return { ok: true, message: t("privacySaved") };
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
    const t = (await getTranslations()) as MessageTranslator;
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const supabase = await createServerSupabaseClient();
  const t = await getTranslations("SettingsActions");
  try {
    await updateProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("appearanceSaveFailed") };
  }

  return { ok: true, message: t("appearanceSaved") };
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
    const t = await getTranslations("SettingsActions");
    return { ok: false, formError: t("localeInvalid") };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  // Resolved AFTER the cookie write, from `locale` (not the request's prior
  // locale) — a language switch should confirm in the language just chosen,
  // not the one being left.
  const t = await getTranslations({ locale, namespace: "SettingsActions" });

  const user = await getCurrentUser();
  if (user && isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    try {
      await updateProfileLocale(supabase, user.id, locale);
    } catch {
      // The cookie is already set, so the UI still switches language even if
      // the profile write fails — it just won't follow this account to
      // another device until it succeeds on a later attempt.
      return { ok: true, message: t("localeSavedDeviceOnly") };
    }
  }

  return { ok: true, message: t("localeSaved") };
}

/** Settings → Safety: unblock. Deleting the `blocks` row does not restore any severed follow. */
export async function unblockUser(blockedId: string): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = uuidSchema.safeParse(blockedId);
  if (!parsed.success) {
    const t = await getTranslations("SettingsActions");
    return { ok: false, formError: t("accountNotFound") };
  }

  const supabase = await createServerSupabaseClient();
  const t = await getTranslations("Common");
  try {
    await unblockProfile(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("unblockFailed") };
  }

  return { ok: true, message: t("accountUnblocked") };
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
  const t = await getTranslations("SettingsActions");
  if (!parsed.success) {
    return { ok: false, formError: t("notifPrefsInvalid") };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await updateNotificationPreferencesDb(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, formError: t("notifPrefsSaveFailed") };
  }

  return { ok: true, message: t("notifPrefsSaved") };
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
  const t = await getTranslations("SettingsActions");

  try {
    const profile = await getProfileById(supabase, user.id);
    if (!profile) {
      return { ok: false, formError: t("profileNotFound") };
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
    return { ok: false, formError: t("exportFailed") };
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
 * sweeps both buckets' objects for this account AFTER the auth user (and
 * therefore every dependent row) is gone — deliberately the opposite order
 * from `deleteWaveDetails` (`w/[id]/actions.ts`), whose per-Wave cleanup
 * runs before the row it points at is removed. Deleting storage first here
 * would mean: if `deleteUser` then failed, the account survives with every
 * one of its recordings already destroyed and not one row changed —
 * unrecoverable data loss on a product made of people's voices (review3
 * finding 21). Deleting the auth user first means a failed or partial
 * storage sweep only leaves orphaned objects behind, which a later sweep
 * can still clean up; nothing is lost.
 */
export async function deleteAccount(input: DeleteAccountFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = deleteAccountSchema.safeParse({ confirmHandle: input.confirmHandle });
  const t = await getTranslations("SettingsActions");
  if (!parsed.success) {
    return { ok: false, fieldErrors: { confirmHandle: t("handleConfirmRequired") } };
  }

  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);
  if (!profile || parsed.data.confirmHandle !== profile.username) {
    return { ok: false, fieldErrors: { confirmHandle: t("handleMismatch") } };
  }

  const admin = createAdminClient();

  // AKINTI Pro must be cancelled at the provider before the account is
  // deleted (review3 finding 6): `subscriptions.user_id` is `on delete
  // cascade`, so once the auth user is gone the local record linking a
  // still-charging subscription to a person disappears with it. Same
  // "refuse rather than partially delete" shape as the storage cleanup
  // below — nobody is ever deleted while still being billed.
  const activeSubscription = await getLatestSubscriptionForUser(admin, user.id);
  if (
    activeSubscription &&
    activeSubscription.status !== "canceled" &&
    activeSubscription.status !== "expired"
  ) {
    try {
      await cancelSubscriptionForUser(admin, user.id);
    } catch (err) {
      console.error("[settings/actions] subscription cancel before account delete failed:", err);
      return { ok: false, formError: t("deleteAccountFailed") };
    }
  }

  try {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch {
    return { ok: false, formError: t("deleteAccountFailed") };
  }

  // The account is gone at this point (every dependent row cascaded with
  // it) — a failure sweeping storage now only leaves orphaned objects
  // behind for a later cleanup pass, never a deleted recording with a
  // surviving account. Still reported to the user as success: the account
  // deletion itself, the part that cannot be silently retried, succeeded.
  try {
    await Promise.all([
      deleteUserStorageObjects(admin.storage.from(AUDIO_BUCKET), user.id),
      deleteUserStorageObjects(admin.storage.from(AVATAR_BUCKET), user.id),
    ]);
  } catch (err) {
    console.error("[settings/actions] storage cleanup after account delete failed (orphaned objects):", err);
  }

  return { ok: true, redirectTo: routes.login() };
}
