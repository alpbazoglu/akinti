-- AKINTI — Turkish-first i18n infrastructure (i18n agent, 6 Sept 2026).
--
-- Adds `profiles.locale`, the strongest signal in the locale resolution
-- order documented in `src/i18n/locale.ts` ("the profile's locale column if
-- it exists, else a cookie `akinti_locale`, else `Accept-Language`, default
-- `tr` for Turkish browsers, `en` otherwise"). `null` means "no explicit
-- preference recorded yet" — the app falls through to the cookie/header
-- signal rather than treating `null` as a fixed language, so an existing
-- account with no row value keeps resolving locale exactly as it did before
-- this column existed.
--
-- Not server-owned: a signed-in user sets their own locale from Settings
-- (`updateProfileLocale`, `src/lib/db/profiles.ts`), scoped by the existing
-- `profiles_update_own` RLS policy (migration 12: `id = auth.uid()`) like
-- every other self-service profile column. No change needed to
-- `profiles_guard_moderation_columns` (migration 23) — that trigger only
-- locks `is_moderator`/`suspended_until`, both untouched here.

alter table public.profiles
  add column locale text
    constraint profiles_locale_valid check (locale is null or locale in ('tr', 'en'));

comment on column public.profiles.locale is
  'User-chosen UI locale (''tr''/''en''). Null means no explicit preference — resolve from the akinti_locale cookie, then Accept-Language, defaulting to tr for Turkish browsers.';
