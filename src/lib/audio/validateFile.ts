/**
 * Client-side upload validation (spec section 18).
 *
 * This is a fast-feedback check only — it exists so a user finds out about a
 * bad file in milliseconds instead of after an upload round-trip. It is NOT
 * the security boundary: the server independently re-validates size,
 * duration and magic bytes before ever accepting a file as audio (spec §18:
 * "never trust client-provided MIME types alone"), because a client-side
 * check can always be bypassed by a request crafted outside the browser.
 */

import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
} from "@/lib/supabase/config";

export type SniffedAudioKind = "mp3" | "wav" | "ogg" | "flac" | "mp4" | "webm";

export interface ValidateFileResult {
  readonly ok: boolean;
  /** The format detected from file contents, or `null` if unrecognised. */
  readonly kind: SniffedAudioKind | null;
  /** Human-readable reason, set whenever `ok` is `false`. */
  readonly reason: string | null;
}

/** Extensions accepted per detected kind — mirrors `extensionForAudioMimeType` in `lib/supabase/config.ts`. */
const KIND_EXTENSIONS: Readonly<Record<SniffedAudioKind, readonly string[]>> = {
  mp3: ["mp3"],
  wav: ["wav"],
  ogg: ["ogg", "oga"],
  flac: ["flac"],
  mp4: ["m4a", "mp4", "aac"],
  webm: ["webm"],
};

export const ALL_ALLOWED_EXTENSIONS: readonly string[] = Object.values(KIND_EXTENSIONS).flat();

const KIND_MIME_TYPES: Readonly<Record<SniffedAudioKind, readonly string[]>> = {
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
  ogg: ["audio/ogg"],
  flac: ["audio/flac"],
  mp4: ["audio/mp4", "audio/aac"],
  webm: ["audio/webm"],
};

const MAGIC_BYTES_READ_LENGTH = 32;

function bytesMatch(bytes: Uint8Array, offset: number, sequence: string): boolean {
  if (offset < 0 || offset + sequence.length > bytes.length) return false;
  for (let i = 0; i < sequence.length; i += 1) {
    if (bytes[offset + i] !== sequence.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify an audio container/format from its leading bytes. Pure and
 * synchronous so it is trivially unit-testable with hand-built byte arrays.
 *
 * Recognises: MP3 (an `ID3` tag, or a raw MPEG frame sync `11111111 111xxxxx`),
 * WAV (`RIFF....WAVE`), OGG (`OggS`), FLAC (`fLaC`), M4A/MP4 (`....ftyp` at
 * byte 4), and WebM/Matroska (the EBML header `1A 45 DF A3`).
 */
export function sniffAudioKind(bytes: Uint8Array): SniffedAudioKind | null {
  if (bytesMatch(bytes, 0, "ID3")) return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (bytesMatch(bytes, 0, "RIFF") && bytesMatch(bytes, 8, "WAVE")) return "wav";
  if (bytesMatch(bytes, 0, "OggS")) return "ogg";
  if (bytesMatch(bytes, 0, "fLaC")) return "flac";
  if (bytesMatch(bytes, 4, "ftyp")) return "mp4";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }
  return null;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export interface ValidateFileOptions {
  maxBytes?: number;
  maxDurationMs?: number;
  /**
   * Duration in ms, if the caller has already decoded it (e.g. via
   * `getDurationMs` in `decode.ts`). Skipped when omitted — this module does
   * not decode audio itself.
   */
  durationMs?: number | null;
}

/**
 * Validate an uploaded `File` before offering it for upload: extension
 * allow-list, byte size, magic-byte sniffing, and (when the caller supplies
 * it) duration. Returns a structured result rather than throwing, so the
 * caller can render inline feedback per spec §38.
 */
export async function validateFile(
  file: File,
  options: ValidateFileOptions = {},
): Promise<ValidateFileResult> {
  const maxBytes = options.maxBytes ?? MAX_AUDIO_BYTES;
  const maxDurationMs = options.maxDurationMs ?? MAX_AUDIO_DURATION_MS;

  if (file.size <= 0) {
    return { ok: false, kind: null, reason: "This file is empty." };
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, kind: null, reason: `This file is larger than the ${maxMb} MB limit.` };
  }

  const extension = extensionOf(file.name);
  if (!ALL_ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      ok: false,
      kind: null,
      reason: `Unsupported file type. Allowed formats: ${ALL_ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }

  const head = new Uint8Array(await file.slice(0, MAGIC_BYTES_READ_LENGTH).arrayBuffer());
  const kind = sniffAudioKind(head);

  if (!kind) {
    return {
      ok: false,
      kind: null,
      reason: "This file does not look like a supported audio format.",
    };
  }

  if (!KIND_EXTENSIONS[kind].includes(extension)) {
    return {
      ok: false,
      kind,
      reason: `This file's contents look like ${kindLabel(kind)}, which doesn't match its ".${extension}" extension.`,
    };
  }

  if (typeof options.durationMs === "number" && options.durationMs > maxDurationMs) {
    const maxMinutes = Math.round(maxDurationMs / 60000);
    return {
      ok: false,
      kind,
      reason: `This file is longer than the ${maxMinutes}-minute limit.`,
    };
  }

  return { ok: true, kind, reason: null };
}

function kindLabel(kind: SniffedAudioKind): string {
  switch (kind) {
    case "mp3":
      return "an MP3";
    case "wav":
      return "a WAV file";
    case "ogg":
      return "an OGG file";
    case "flac":
      return "a FLAC file";
    case "mp4":
      return "an M4A/MP4 file";
    case "webm":
      return "a WebM file";
    default:
      return "an unrecognised format";
  }
}

/** The allowed MIME type(s) matching a sniffed kind — for informational display only. */
export function mimeTypesForKind(kind: SniffedAudioKind): readonly string[] {
  return KIND_MIME_TYPES[kind].filter((mime) =>
    (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime),
  );
}
