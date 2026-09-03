"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { mapAuthError } from "@/lib/auth/errors";
import { fieldErrorsFromZod, type AuthActionResult } from "@/lib/auth/types";
import { isUsernameAvailable } from "@/lib/db/profiles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  requestPasswordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";

/**
 * Server Actions backing every `(auth)` form. Every action here follows the
 * same contract: parse with Zod, never throw to the client, return
 * `{ ok, fieldErrors, formError }` (dev rule 9 — never fake success, never a
 * raw stack trace as UI). A successful sign-in/sign-up redirects instead of
 * returning `ok: true`, since `redirect()` unwinds the action entirely; the
 * `ok: true` branch is for actions that succeed without navigating away
 * (password reset request, password update).
 */

/** A relative, same-origin path only — never follow an external `next` value. */
function sanitizeNextPath(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}

/** Best-effort origin for building the email links Supabase sends (reset password, confirmation). */
async function resolveOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUp(
  _prevState: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const { email, password, username } = parsed.data;
  const supabase = await createServerSupabaseClient();

  if (!(await isUsernameAvailable(supabase, username))) {
    return { ok: false, fieldErrors: { username: "That username is taken." } };
  }

  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}${routes.authCallback()}?next=${encodeURIComponent(routes.onboarding())}`,
    },
  });

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  if (!data.session) {
    // Email confirmation is required before a session exists (the default
    // for a hosted project — see `supabase/config.toml`'s local override).
    return {
      ok: true,
      message: "Check your inbox to confirm your email, then sign in to finish setting up your account.",
    };
  }

  redirect(routes.onboarding());
}

export async function signIn(
  _prevState: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  const next = sanitizeNextPath(formData.get("next"));
  redirect(next ?? routes.home());
}

export async function signOut(): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  redirect(routes.home());
}

export async function requestPasswordReset(
  _prevState: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  const origin = await resolveOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}${routes.authCallback()}?next=${encodeURIComponent(routes.resetPassword())}`,
  });

  // Supabase's own client already avoids confirming whether the address has
  // an account; match that here rather than branching on `error` for a
  // "not found" case that would leak account existence.
  if (error && error.code !== "user_not_found") {
    return { ok: false, formError: mapAuthError(error) };
  }

  return {
    ok: true,
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function updatePassword(
  _prevState: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, formError: "Your session has expired. Request a new reset link and try again." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  return { ok: true, message: "Password updated." };
}
