/**
 * Message keys for the Supabase Auth error codes AKINTI's flows can
 * actually hit. Server Actions never forward a raw Supabase error message to
 * the client (spec §38 — no silent failures, but also no leaking backend
 * internals); they call `mapAuthError` and show the result as `formError`.
 *
 * Supabase Auth (`@supabase/supabase-js` v2) sets a stable `code` on
 * `AuthApiError` for the errors relevant here. `code` is preferred; the
 * `message` substring match is a fallback for older/edge error shapes that
 * don't carry a code (e.g. a network failure surfaced by the client itself).
 *
 * Every message resolves through the `AuthErrors` namespace
 * (`src/messages/{en,tr}.json`) via the caller's own root translator
 * (`getTranslations()`, `docs/I18N.md` §8.1 — same pattern
 * `mapModerationError`, `src/lib/moderation/errors.ts`, uses), rather than
 * a hardcoded English string (review3 finding 2: this used to be the one
 * remaining English-only error-mapping module server-side i18n missed).
 */

import type { MessageTranslator } from "@/lib/validation/translate";

export interface AuthErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

const CODE_MESSAGE_KEYS: Record<string, string> = {
  invalid_credentials: "AuthErrors.invalidCredentials",
  email_not_confirmed: "AuthErrors.emailNotConfirmed",
  user_already_exists: "AuthErrors.userAlreadyExists",
  email_exists: "AuthErrors.userAlreadyExists",
  user_not_found: "AuthErrors.userNotFound",
  weak_password: "AuthErrors.weakPassword",
  same_password: "AuthErrors.samePassword",
  signup_disabled: "AuthErrors.signupDisabled",
  email_address_invalid: "AuthErrors.emailAddressInvalid",
  email_address_not_authorized: "AuthErrors.emailAddressNotAuthorized",
  over_request_rate_limit: "AuthErrors.overRequestRateLimit",
  over_email_send_rate_limit: "AuthErrors.overEmailSendRateLimit",
  session_not_found: "AuthErrors.sessionExpired",
  session_expired: "AuthErrors.sessionExpired",
  refresh_token_not_found: "AuthErrors.sessionExpired",
  refresh_token_already_used: "AuthErrors.sessionExpired",
  user_banned: "AuthErrors.userBanned",
  validation_failed: "AuthErrors.validationFailed",
  reauthentication_needed: "AuthErrors.reauthenticationNeeded",
  identity_already_exists: "AuthErrors.identityAlreadyExists",
  provider_email_needs_verification: "AuthErrors.providerEmailNeedsVerification",
  otp_expired: "AuthErrors.otpExpired",
  otp_disabled: "AuthErrors.otpDisabled",
};

const MESSAGE_FALLBACKS: Array<{ match: RegExp; key: string }> = [
  { match: /invalid login credentials/i, key: CODE_MESSAGE_KEYS.invalid_credentials },
  { match: /email not confirmed/i, key: CODE_MESSAGE_KEYS.email_not_confirmed },
  { match: /user already registered/i, key: CODE_MESSAGE_KEYS.user_already_exists },
  { match: /password should be at least/i, key: CODE_MESSAGE_KEYS.weak_password },
  { match: /rate limit/i, key: CODE_MESSAGE_KEYS.over_request_rate_limit },
  { match: /network/i, key: "AuthErrors.networkError" },
];

const DEFAULT_MESSAGE_KEY = "AuthErrors.default";

/** Turn a Supabase Auth error into a message safe to show a user, translated for the caller's request locale. */
export function mapAuthError(error: AuthErrorLike | null | undefined, t: MessageTranslator): string {
  if (!error) {
    return t(DEFAULT_MESSAGE_KEY);
  }

  if (error.code && CODE_MESSAGE_KEYS[error.code]) {
    return t(CODE_MESSAGE_KEYS[error.code]);
  }

  const message = error.message ?? "";
  for (const fallback of MESSAGE_FALLBACKS) {
    if (fallback.match.test(message)) {
      return t(fallback.key);
    }
  }

  return t(DEFAULT_MESSAGE_KEY);
}
