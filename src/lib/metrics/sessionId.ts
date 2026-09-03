"use client";

/**
 * Stable per-browser session id for anonymous Play/Replay dedup (spec §13):
 * `record_play_event` keys an anonymous listener as `s:<session>`
 * (`wave_listens.listener_key`). A signed-in listener doesn't need this —
 * the server keys them by user id instead — but a value is always sent
 * regardless, since `playbackReportSchema` requires >= 8 characters and the
 * RPC ignores it when `auth.uid()` is present.
 *
 * Cookie, not `localStorage`: matches the "stable session-id cookie" this
 * stage's brief calls for, and survives the same contexts (SSR reads
 * nothing from either, both are browser-only — this module never runs
 * server-side).
 */

const COOKIE_NAME = "akinti_sid";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

let cached: string | null = null;

/** Returns the same id for the lifetime of the browser (1 year cookie), creating one on first use. */
export function getOrCreateSessionId(): string {
  if (cached && cached.length >= 8) return cached;

  const existing = readCookie(COOKIE_NAME);
  if (existing && existing.length >= 8) {
    cached = existing;
    return existing;
  }

  const created = randomId();
  writeCookie(COOKIE_NAME, created, COOKIE_MAX_AGE_SECONDS);
  cached = created;
  return created;
}
