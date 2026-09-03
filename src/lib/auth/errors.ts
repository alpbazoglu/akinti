/**
 * English translations for the Supabase Auth error codes AKINTI's flows can
 * actually hit. Server Actions never forward a raw Supabase error message to
 * the client (spec §38 — no silent failures, but also no leaking backend
 * internals); they call `mapAuthError` and show the result as `formError`.
 *
 * Supabase Auth (`@supabase/supabase-js` v2) sets a stable `code` on
 * `AuthApiError` for the errors relevant here. `code` is preferred; the
 * `message` substring match is a fallback for older/edge error shapes that
 * don't carry a code (e.g. a network failure surfaced by the client itself).
 */

export interface AuthErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password combination is not correct.",
  email_not_confirmed: "Confirm your email address before signing in. Check your inbox for the confirmation link.",
  user_already_exists: "An account with that email already exists. Try signing in instead.",
  email_exists: "An account with that email already exists. Try signing in instead.",
  user_not_found: "We could not find an account with that email.",
  weak_password: "That password is too weak. Use at least 8 characters.",
  same_password: "That is already your password. Choose a different one.",
  signup_disabled: "New sign-ups are temporarily disabled.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized: "That email address is not authorized to sign up.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  over_email_send_rate_limit: "Too many emails requested. Wait a few minutes and try again.",
  session_not_found: "Your session has expired. Sign in again.",
  session_expired: "Your session has expired. Sign in again.",
  refresh_token_not_found: "Your session has expired. Sign in again.",
  refresh_token_already_used: "Your session has expired. Sign in again.",
  user_banned: "This account has been suspended.",
  validation_failed: "Check the highlighted fields and try again.",
  reauthentication_needed: "Sign in again to confirm this change.",
  identity_already_exists: "That account is already linked.",
  provider_email_needs_verification: "Verify your email address to continue.",
  otp_expired: "That code has expired. Request a new one.",
  otp_disabled: "That sign-in method is not available.",
};

const MESSAGE_FALLBACKS: Array<{ match: RegExp; message: string }> = [
  { match: /invalid login credentials/i, message: CODE_MESSAGES.invalid_credentials },
  { match: /email not confirmed/i, message: CODE_MESSAGES.email_not_confirmed },
  { match: /user already registered/i, message: CODE_MESSAGES.user_already_exists },
  { match: /password should be at least/i, message: CODE_MESSAGES.weak_password },
  { match: /rate limit/i, message: CODE_MESSAGES.over_request_rate_limit },
  { match: /network/i, message: "Could not reach the server. Check your connection and try again." },
];

const DEFAULT_MESSAGE = "Something went wrong. Try again in a moment.";

/** Turn a Supabase Auth error into a message safe to show a user. */
export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) {
    return DEFAULT_MESSAGE;
  }

  if (error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code];
  }

  const message = error.message ?? "";
  for (const fallback of MESSAGE_FALLBACKS) {
    if (fallback.match.test(message)) {
      return fallback.message;
    }
  }

  return DEFAULT_MESSAGE;
}
