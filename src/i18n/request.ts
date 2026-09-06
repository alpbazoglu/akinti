import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { getCurrentProfile } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { formats } from "./formats";
import { LOCALE_COOKIE, resolveLocale } from "./locale";
import type { AppLocale } from "./locale";

/**
 * next-intl request config (App Router, no URL locale prefix — see
 * `docs/research/libraries.md`/AKINTI's i18n decision: this product never
 * shows `/tr/...` or `/en/...`, so the locale is resolved server-side per
 * request instead of via routing).
 *
 * Resolution order implemented by `resolveLocale` (`src/i18n/locale.ts`):
 * the signed-in profile's `locale` column, then the `akinti_locale` cookie,
 * then `Accept-Language`, defaulting to Turkish for a Turkish browser and
 * English otherwise. `getCurrentProfile()` is the same `React.cache()`-
 * memoized read the root layout already makes, so resolving locale here
 * costs nothing extra when a profile is already being fetched this request.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore, profile] = await Promise.all([
    cookies(),
    headers(),
    isSupabaseConfigured() ? getCurrentProfile() : Promise.resolve(null),
  ]);

  const locale: AppLocale = resolveLocale({
    profileLocale: profile?.locale ?? null,
    cookieValue: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerStore.get("accept-language"),
  });

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages, formats };
});
