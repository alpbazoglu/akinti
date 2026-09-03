/**
 * `audio_assets` + the signed-URL strategy for the private `audio` bucket.
 *
 * Processing columns (`processed_path`, `peaks`, `processing_status`, ...) are
 * server-owned: `audio_assets_guard_update` (migration 12) rejects a client
 * attempt to set them directly. The only legitimate writer is
 * `scripts/worker.ts`, through `complete_audio_job` / `fail_audio_job`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AUDIO_BUCKET,
  SIGNED_AUDIO_URL_TTL_SECONDS,
} from "@/lib/supabase/config";
import type { CreateAudioAssetInput } from "@/lib/validation/audio";
import type { AudioAsset, AudioJobType } from "@/types/domain";
import type { Database, Json } from "@/types/database";

import { toAudioAsset } from "./mappers";
import { NotFoundError, unwrap, unwrapMaybe } from "./types";
import type { Db } from "./types";

/** Register an already-uploaded original file. Kicks off no processing by itself. */
export async function createAudioAsset(
  db: Db,
  ownerId: string,
  input: CreateAudioAssetInput,
): Promise<AudioAsset> {
  const result = await db
    .from("audio_assets")
    .insert({
      owner_id: ownerId,
      original_path: input.original_path,
      mime_type: input.mime_type,
      byte_size: input.byte_size,
      duration_ms: input.duration_ms ?? null,
      sample_rate: input.sample_rate ?? null,
      channels: input.channels ?? null,
      enhancement_preset: input.enhancement_preset,
      checksum_sha256: input.checksum_sha256 ?? null,
    })
    .select("*")
    .single();
  return toAudioAsset(unwrap("createAudioAsset", result));
}

export async function getAudioAssetById(db: Db, assetId: string): Promise<AudioAsset | null> {
  const result = await db.from("audio_assets").select("*").eq("id", assetId).maybeSingle();
  const row = unwrapMaybe("getAudioAssetById", result);
  return row ? toAudioAsset(row) : null;
}

/** Change the enhancement preset before (re)enqueuing processing. */
export async function updateAudioAssetPreset(
  db: Db,
  assetId: string,
  preset: AudioAsset["enhancementPreset"],
): Promise<AudioAsset> {
  const result = await db
    .from("audio_assets")
    .update({ enhancement_preset: preset })
    .eq("id", assetId)
    .select("*")
    .single();
  return toAudioAsset(unwrap("updateAudioAssetPreset", result));
}

export async function deleteAudioAsset(db: Db, assetId: string): Promise<void> {
  const result = await db.from("audio_assets").delete().eq("id", assetId);
  if (result.error) {
    throw result.error;
  }
}

/** Queue background processing for a Recorded/Uploaded Wave (spec s19). */
export async function enqueueAudioProcessing(
  db: Db,
  assetId: string,
  preset: AudioAsset["enhancementPreset"] = "natural",
): Promise<number> {
  const result = await db.rpc("enqueue_audio_job", {
    p_audio_asset_id: assetId,
    p_job_type: "process_audio" satisfies AudioJobType,
    p_payload: { preset } satisfies Json,
  });
  return unwrap("enqueueAudioProcessing", result);
}

/** Queue the server-side Duet mixdown (spec s15: never trust client mixing). */
export async function enqueueDuetMix(
  db: Db,
  newTakeAssetId: string,
  referenceAssetId: string,
  offsetMs: number,
  preset: AudioAsset["enhancementPreset"] = "studio",
): Promise<number> {
  const result = await db.rpc("enqueue_audio_job", {
    p_audio_asset_id: newTakeAssetId,
    p_job_type: "mix_duet" satisfies AudioJobType,
    p_payload: {
      preset,
      reference_asset_id: referenceAssetId,
      offset_ms: offsetMs,
    } satisfies Json,
  });
  return unwrap("enqueueDuetMix", result);
}

export type SignedAudioVariant = "original" | "processed";

export interface SignedAudioUrl {
  url: string;
  expiresAt: string;
}

/**
 * Mint a short-lived signed URL for a private audio object.
 *
 * Authorization happens in two layers, both required:
 *  1. `db` (the caller's RLS-scoped client) reads the `audio_assets` row —
 *     the `audio_assets_select` policy calls `can_view_audio_asset()`, so this
 *     SELECT itself throws `NotFoundError` for anyone who should not see it.
 *  2. Only after that succeeds do we mint the URL, and we do it with `admin`
 *     (service role) because there is deliberately no listener SELECT policy
 *     on `storage.objects` — a non-owner listener has no storage access of
 *     their own to sign against (see docs/SECURITY.md).
 */
export async function mintSignedAudioUrl(
  db: Db,
  admin: SupabaseClient<Database>,
  assetId: string,
  variant: SignedAudioVariant,
): Promise<SignedAudioUrl> {
  const asset = await getAudioAssetById(db, assetId);
  if (!asset) {
    throw new NotFoundError("audio asset");
  }

  const path = variant === "original" ? asset.originalPath : asset.processedPath;
  if (!path) {
    throw new NotFoundError(`audio asset ${variant} file`);
  }

  const { data, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_AUDIO_URL_TTL_SECONDS);
  if (error || !data) {
    throw error ?? new Error("Failed to sign audio URL");
  }

  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_AUDIO_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

/** Prefer the processed file once it exists; fall back to the original while pending. */
export async function mintPlaybackUrl(
  db: Db,
  admin: SupabaseClient<Database>,
  assetId: string,
): Promise<SignedAudioUrl & { variant: SignedAudioVariant }> {
  const asset = await getAudioAssetById(db, assetId);
  if (!asset) {
    throw new NotFoundError("audio asset");
  }
  const variant: SignedAudioVariant = asset.processedPath ? "processed" : "original";
  const signed = await mintSignedAudioUrl(db, admin, assetId, variant);
  return { ...signed, variant };
}
