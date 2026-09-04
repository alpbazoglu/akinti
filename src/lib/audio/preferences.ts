"use client";

/**
 * Settings → Audio (spec §25: "playback preferences, autoplay, audio
 * quality where appropriate"). Client-only, per-device: `localStorage`, not
 * `profiles` — there is no server-side "Audio" preference row anywhere in
 * this schema, and these aren't safety/notification-shaped settings that
 * need to sync across devices, so a new migration + RLS surface for them
 * would be more machinery than the feature is worth. `src/app/(app)/settings/audio/page.tsx`
 * says so explicitly in its own copy rather than implying these sync.
 *
 * "Preferred quality" is honest about what this codebase can actually do
 * today: `audio_assets` (migration 03) stores exactly one processed file per
 * asset — there is no multi-bitrate/adaptive delivery pipeline to switch
 * between. `data_saver` therefore doesn't yet change what gets fetched; it's
 * stored so a future encoding pipeline has a preference to read, and the
 * settings page is explicit that it isn't wired to playback yet.
 *
 * Autoplay-next is stored here for the same reason it isn't wired into
 * `src/lib/audio/playbackStore.ts`: the store manages exactly one Wave and
 * has no concept of "the next item" — that concept only exists at the
 * feed/queue level (`HomeFeed`, `Explore`, a Wave's own comments list are
 * all different owners of "what's next"), which is out of scope for this
 * stage to redesign. The preference is real and persisted; a future feed
 * pass can read `getAudioPreferences().autoplayNext` when it adds a queue.
 */

export type AudioQualityPreference = "auto" | "data_saver";

export interface AudioPreferences {
  autoplayNext: boolean;
  quality: AudioQualityPreference;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  autoplayNext: true,
  quality: "auto",
};

const STORAGE_KEY = "akinti.audio.preferences.v1";

/**
 * In-module subscriber list for `useSyncExternalStore` (React's sanctioned
 * way to read a mutable external store — `localStorage` here — during
 * render without a hydration mismatch or a "setState in an effect" lint
 * violation: `getServerSnapshot` returns the defaults for the very first
 * client render, matching SSR, and a real read only happens after mount).
 * `src/app/(app)/settings/audio/AudioPreferencesForm.tsx` is the only
 * subscriber today.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

function notifyAudioPreferencesChanged(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to changes made via `setAudioPreferences` (including from another component instance). */
export function subscribeAudioPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `getServerSnapshot` for `useSyncExternalStore` — SSR never has `localStorage`. */
export function getServerAudioPreferences(): AudioPreferences {
  return DEFAULT_AUDIO_PREFERENCES;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isValidQuality(value: unknown): value is AudioQualityPreference {
  return value === "auto" || value === "data_saver";
}

/** Pure — exported so the parsing/fallback rules are unit-testable without touching `localStorage`. */
export function parseAudioPreferences(raw: string | null): AudioPreferences {
  if (!raw) {
    return DEFAULT_AUDIO_PREFERENCES;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof AudioPreferences, unknown>>;
    return {
      autoplayNext:
        typeof parsed.autoplayNext === "boolean"
          ? parsed.autoplayNext
          : DEFAULT_AUDIO_PREFERENCES.autoplayNext,
      quality: isValidQuality(parsed.quality) ? parsed.quality : DEFAULT_AUDIO_PREFERENCES.quality,
    };
  } catch {
    // Corrupt/foreign value under our key — degrade to defaults rather than throw.
    return DEFAULT_AUDIO_PREFERENCES;
  }
}

/** Reads the current preferences. Always returns a value — never throws, degrades to defaults. */
export function getAudioPreferences(): AudioPreferences {
  if (!isBrowser()) {
    return DEFAULT_AUDIO_PREFERENCES;
  }
  try {
    return parseAudioPreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage inaccessible (private-mode Safari, disabled storage, ...).
    return DEFAULT_AUDIO_PREFERENCES;
  }
}

/** Merges `patch` into the stored preferences and persists the result. Returns the new value either way. */
export function setAudioPreferences(patch: Partial<AudioPreferences>): AudioPreferences {
  const next: AudioPreferences = { ...getAudioPreferences(), ...patch };
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort — the returned value still reflects the caller's intent
      // for this call even if it could not be persisted.
    }
  }
  notifyAudioPreferencesChanged();
  return next;
}
