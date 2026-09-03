import { z } from "zod";

import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
} from "@/lib/supabase/config";
import { AUDIO_ENHANCEMENT_PRESETS } from "@/types/domain";

import { uuidSchema } from "./common";

/**
 * Waveform peaks as produced by the worker. Kept small on purpose — this is
 * stored inline in Postgres and shipped to every client that renders the card.
 */
export const waveformPeaksSchema = z.object({
  version: z.literal(1),
  bits: z.literal(8),
  samples_per_pixel: z.number().int().min(1),
  data: z.array(z.number().int().min(0).max(255)).min(1).max(4000),
});

/**
 * Registering an uploaded/recorded file.
 *
 * NOTE: `mime_type` here is a client claim. It narrows what we accept, but the
 * authoritative check is the magic-byte sniff performed server-side before the
 * asset row is created (spec s18). See docs/AUDIO_ARCHITECTURE.md.
 */
export const createAudioAssetSchema = z.object({
  original_path: z.string().min(1).max(1024),
  mime_type: z.enum(ALLOWED_AUDIO_MIME_TYPES),
  byte_size: z.number().int().positive().max(MAX_AUDIO_BYTES),
  duration_ms: z.number().int().positive().max(MAX_AUDIO_DURATION_MS).nullish(),
  sample_rate: z.number().int().positive().max(192_000).nullish(),
  channels: z.number().int().min(1).max(2).nullish(),
  enhancement_preset: z.enum(AUDIO_ENHANCEMENT_PRESETS).default("natural"),
  checksum_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "Expected a lowercase hex SHA-256 digest")
    .nullish(),
});

export const enqueueProcessingSchema = z.object({
  audioAssetId: uuidSchema,
  preset: z.enum(AUDIO_ENHANCEMENT_PRESETS).default("natural"),
});

export const enqueueDuetMixSchema = z.object({
  /** The new take recorded against the original. */
  audioAssetId: uuidSchema,
  /** The original Wave's audio, used as the reference stem. */
  referenceAssetId: uuidSchema,
  /**
   * Start of the new take relative to the reference, in milliseconds.
   * Negative values are rejected: the contribution cannot start before the
   * reference does. See docs/DUET_SPEC.md.
   */
  offsetMs: z.number().int().min(0).max(MAX_AUDIO_DURATION_MS),
  preset: z.enum(AUDIO_ENHANCEMENT_PRESETS).default("studio"),
});

export type WaveformPeaksInput = z.infer<typeof waveformPeaksSchema>;
export type CreateAudioAssetInput = z.infer<typeof createAudioAssetSchema>;
export type EnqueueProcessingInput = z.infer<typeof enqueueProcessingSchema>;
export type EnqueueDuetMixInput = z.infer<typeof enqueueDuetMixSchema>;
