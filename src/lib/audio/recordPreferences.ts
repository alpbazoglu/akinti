"use client";

/**
 * What the record screen remembers about you, per device.
 *
 * Four things, and they are all the kind of thing that is annoying to be
 * asked twice:
 *
 * - **countdown** — on by default (`mobile-guidelines.md` rule 15), because a
 *   performer needs a beat to get into position. Someone recording their
 *   twentieth voice note this week turns it off, once.
 * - **headphonesHintSeen** — the "best with headphones" nudge is shown once
 *   and never again (rule 18). A hint that reappears is not a hint.
 * - **noisyRoom** — whether the RNNoise monitor is on. It costs a WASM
 *   download, so remembering the answer avoids paying for it repeatedly.
 * - **monitoring** — hearing yourself while you record. Off by default
 *   (rule 19: never through speakers).
 *
 * `localStorage`, not the profile: none of it is safety-shaped, none of it
 * needs to follow you to another device, and adding a migration plus an RLS
 * surface for four booleans would be more machinery than the feature is
 * worth. `src/lib/audio/preferences.ts` makes the same call, for the same
 * reason, about playback settings.
 */

export interface RecordPreferences {
  /** Count 3-2-1 into the take. */
  countdown: boolean;
  /** The headphones nudge has been shown. */
  headphonesHintSeen: boolean;
  /** RNNoise on the monitor path (never on the recording). */
  noisyRoom: boolean;
  /** Route the input to the output so you hear yourself. */
  monitoring: boolean;
}

export const DEFAULT_RECORD_PREFERENCES: RecordPreferences = {
  countdown: true,
  headphonesHintSeen: false,
  noisyRoom: false,
  monitoring: false,
};

const STORAGE_KEY = "akinti.record.preferences.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to changes, including ones made by another component instance. */
export function subscribeRecordPreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `getServerSnapshot` for `useSyncExternalStore` — SSR has no `localStorage`. */
export function getServerRecordPreferences(): RecordPreferences {
  return DEFAULT_RECORD_PREFERENCES;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Pure, so the parsing and fallback rules are testable without storage. */
export function parseRecordPreferences(raw: string | null): RecordPreferences {
  if (!raw) return DEFAULT_RECORD_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof RecordPreferences, unknown>>;
    return {
      countdown: readBoolean(parsed.countdown, DEFAULT_RECORD_PREFERENCES.countdown),
      headphonesHintSeen: readBoolean(
        parsed.headphonesHintSeen,
        DEFAULT_RECORD_PREFERENCES.headphonesHintSeen,
      ),
      noisyRoom: readBoolean(parsed.noisyRoom, DEFAULT_RECORD_PREFERENCES.noisyRoom),
      monitoring: readBoolean(parsed.monitoring, DEFAULT_RECORD_PREFERENCES.monitoring),
    };
  } catch {
    return DEFAULT_RECORD_PREFERENCES;
  }
}

/**
 * The stored preferences. The object identity is stable while nothing has
 * changed, which is what `useSyncExternalStore` needs to avoid an infinite
 * re-render loop.
 */
let cached: RecordPreferences = DEFAULT_RECORD_PREFERENCES;
let cachedRaw: string | null = null;
let hasRead = false;

export function getRecordPreferences(): RecordPreferences {
  if (!isBrowser()) return DEFAULT_RECORD_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (hasRead && raw === cachedRaw) return cached;
    cached = parseRecordPreferences(raw);
    cachedRaw = raw;
    hasRead = true;
    return cached;
  } catch {
    // Storage blocked (private-mode Safari, disabled site data).
    return DEFAULT_RECORD_PREFERENCES;
  }
}

/** Merge `patch` in and persist. Returns the new value whether or not it stored. */
export function setRecordPreferences(patch: Partial<RecordPreferences>): RecordPreferences {
  const next: RecordPreferences = { ...getRecordPreferences(), ...patch };
  cached = next;
  cachedRaw = JSON.stringify(next);
  hasRead = true;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, cachedRaw);
    } catch {
      // Best effort; the value still reflects this session's intent.
    }
  }
  for (const listener of listeners) listener();
  return next;
}
