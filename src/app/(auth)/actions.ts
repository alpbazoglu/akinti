"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { mapAuthError } from "@/lib/auth/errors";
import { fieldErrorsFromZod, type AuthActionResult } from "@/lib/auth/types";
import { getProfileById, isUsernameAvailable } from "@/lib/db/profiles";
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
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  const next = sanitizeNextPath(formData.get("next"));

  // Deliberately NOT `redirect()` here (unlike every other action in this
  // file): a server-action `redirect()` drives a client-side transition
  // whose RSC fetch does not reliably carry the auth cookie this very call
  // just set (reproduced directly against the live project — the outgoing
  // request has no `Cookie` header at all, even though the browser's
  // cookie jar has it at `path=/`). The destination can render fully
  // signed-out despite a valid session until the next hard navigation.
  // `LoginForm` performs a real `window.location.assign` instead (see
  // `useAuthRedirect`, and the identical fix already applied to
  // `OnboardingFlow.tsx`'s post-finish navigation) once it sees
  // `redirectTo` below.
  //
  // Onboarding status is checked here too (rather than only relying on
  // `updateSession`'s gate in `src/lib/supabase/middleware.ts`, which only
  // ever sees the *next* real request) so a not-yet-onboarded sign-in lands
  // straight on `/onboarding`, the same way `signUp` does for its own
  // post-signup landing.
  if (data.user) {
    const profile = await getProfileById(supabase, data.user.id);
    if (!profile?.onboardedAt) {
      return { ok: true, redirectTo: routes.onboarding(next) };
    }
  }

  // Flow (`docs/FLOW.md`, founder decision 6 Sept 2026) is the default
  // screen after login; the follow-only list stays reachable as Home.
  return { ok: true, redirectTo: next ?? routes.flow() };
}

export async function signOut(): Promise<AuthActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, formError: mapAuthError(error) };
  }

  // Deliberately NOT `redirect()` here, for the same reason `signIn` isn't
  // (see the doc comment on `AuthActionResult.redirectTo`): a server-action
  // `redirect()` drives a client-side transition that does not reliably
  // finish before the caller's own client state (e.g. `AuthProvider`, or a
  // menu invoked outside a `<form action>`/`startTransition`) has settled —
  // reproduced directly as a sign-out from `UserMenu` that left the previous
  // page fully rendered in its signed-in state instead of navigating away.
  // The caller does a real `window.location.assign` instead, which both
  // guarantees the navigation happens and resets every bit of client auth
  // state via a fresh, fully server-rendered load.
  return { ok: true, redirectTo: routes.login() };
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
