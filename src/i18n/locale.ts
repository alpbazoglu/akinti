/**
 * Locale resolution — pure decision logic, kept separate from
 * `src/i18n/request.ts` (which reads the actual cookie/header/profile and is
 * therefore not unit-testable without a request context) so the precedence
 * rule itself has a direct test (`locale.test.ts`).
 *
 * Resolution order (spec): the signed-in profile's `locale` column, if it
 * holds a value, wins outright. Otherwise the `akinti_locale` cookie, if
 * set. Otherwise the `Accept-Language` header: Turkish for a Turkish
 * browser, English for everything else (including no header at all).
 */

export const LOCALES = ["tr", "en"] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Not a URL segment (this product ships without locale-prefixed routes) — just the cookie name Settings and `i18n/request.ts` share. */
export const LOCALE_COOKIE = "akinti_locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "tr" || value === "en";
}

/**
 * `Accept-Language` -> `AppLocale`. Turkish wins if it appears anywhere in
 * the header's ranked list (a browser set to Turkish among other languages
 * should still see Turkish); everything else, including a missing or
 * unparseable header, falls back to English.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));
  const isTurkish = tags.some((tag) => tag === "tr" || tag.startsWith("tr-"));
  return isTurkish ? "tr" : "en";
}

export interface ResolveLocaleInput {
  /** `profiles.locale` for the signed-in user, or `null`/`undefined` when signed out or unset. */
  profileLocale?: string | null;
  /** The `akinti_locale` cookie's raw value, if present. */
  cookieValue?: string | null;
  /** The raw `Accept-Language` request header. */
  acceptLanguage?: string | null;
}

/** The one place the profile -> cookie -> header precedence is decided. */
export function resolveLocale({
  profileLocale,
  cookieValue,
  acceptLanguage,
}: ResolveLocaleInput): AppLocale {
  if (isAppLocale(profileLocale)) return profileLocale;
  if (isAppLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage);
}
