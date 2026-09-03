/**
 * Supabase environment + storage conventions for AKINTI.
 *
 * Nothing in this file reads a secret at module scope beyond `process.env`
 * lookups that Next inlines at build time. `SUPABASE_SERVICE_ROLE_KEY` is read
 * lazily and only ever from server-side code (see `admin.ts`).
 */

/** Public project URL. Empty string when the project is not configured yet. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Public anon key. Safe to ship to the browser; RLS is what protects data. */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * True when both public Supabase variables are present.
 *
 * The app is expected to render a clear "not configured" state rather than
 * crashing when this is false — a missing `.env.local` is a setup problem, not
 * a runtime error worth a stack trace.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/** Same as `isSupabaseConfigured`, but throws with an actionable message. */
export function requireSupabaseConfig(): SupabasePublicConfig {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.example).",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/** Server-only. Throws if called without the service role key present. */
export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. It is required for the audio " +
        "worker and for minting signed URLs, and must never be exposed to the browser.",
    );
  }
  return key;
}

/* ------------------------------------------------------------------------ */
/* Storage                                                                   */
/* ------------------------------------------------------------------------ */

/** PRIVATE bucket. Every read goes through a short-lived signed URL. */
export const AUDIO_BUCKET = "audio" as const;

/** PUBLIC bucket. Profile pictures only — AKINTI has no image posts. */
export const AVATAR_BUCKET = "avatars" as const;

/**
 * Signed URL lifetime for private audio.
 *
 * 10 minutes: long enough to start and finish a typical Wave (and to survive a
 * seek or a brief network drop), short enough that a leaked URL is worthless
 * almost immediately. Longer Waves re-sign on demand.
 */
export const SIGNED_AUDIO_URL_TTL_SECONDS = 600;

/** Upload limits. Mirrored by CHECK constraints on `audio_assets`. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 30 * 60 * 1000;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
] as const;

export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

export function isAllowedAudioMimeType(value: string): value is AllowedAudioMimeType {
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(value);
}

export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
] as const;

/**
 * Object key layout. The FIRST path segment must be the owner's user id —
 * the storage policies in migration 13 authorise on exactly that segment.
 */
export function audioOriginalPath(ownerId: string, assetId: string, extension: string): string {
  return `${ownerId}/${assetId}/original.${normaliseExtension(extension)}`;
}

export function audioProcessedPath(ownerId: string, assetId: string, extension: string): string {
  return `${ownerId}/${assetId}/processed.${normaliseExtension(extension)}`;
}

export function avatarPath(ownerId: string, filename: string): string {
  return `${ownerId}/${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function normaliseExtension(extension: string): string {
  const cleaned = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return cleaned.length > 0 ? cleaned : "bin";
}

/** Best-effort file extension for a supported audio MIME type. */
export function extensionForAudioMimeType(mimeType: string): string {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
    case "audio/aac":
      return "m4a";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/flac":
      return "flac";
    default:
      return "bin";
  }
}
