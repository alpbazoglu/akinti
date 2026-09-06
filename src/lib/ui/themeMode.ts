/**
 * Theme mode (Settings → Appearance): system/light/dark. Pure decision
 * logic only, mirroring `src/i18n/locale.ts`'s split between a pure
 * resolver (unit-tested here) and the actual cookie read, which lives in
 * `src/app/layout.tsx` where `cookies()` has a request context.
 *
 * Not a profile column — unlike locale, a theme preference has no
 * cross-device product reason to follow the account (COLOR_V2 makes no such
 * claim), so a cookie alone is the whole mechanism, exactly like the
 * `akinti_locale` cookie's "fast path" half without the profile-column half.
 * `system` means "no override" and is never written to the cookie — the
 * absence of the cookie already means system, so the row is expressed as
 * clearing it (see `setThemeMode`, `src/app/(app)/settings/actions.ts`).
 *
 * The `data-theme` attribute this resolves to is not new plumbing: the CSS
 * (`src/app/globals.css`) and the two canvas components
 * (`WaveformCanvas.tsx`, `LiveWaterline.tsx`) already watch for it — this
 * module is what finally writes it.
 */

export const THEME_MODES = ["system", "light", "dark"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** Not a URL segment — just the cookie name Settings and `layout.tsx` share. */
export const THEME_COOKIE = "akinti_theme";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

/** The `akinti_theme` cookie's raw value -> `ThemeMode`, defaulting to `system` for anything unset/invalid. */
export function resolveThemeMode(cookieValue: string | null | undefined): ThemeMode {
  return isThemeMode(cookieValue) ? cookieValue : "system";
}

/** `data-theme` attribute value for `<html>` — `undefined` for `system` means "omit the attribute", letting `prefers-color-scheme` decide. */
export function themeModeToDataAttribute(mode: ThemeMode): "light" | "dark" | undefined {
  return mode === "system" ? undefined : mode;
}
