/**
 * The hand-off contract between this client capture flow and whichever agent
 * wires it to Supabase (spec sections 11, 17, 18, 19).
 *
 * `CreateWaveDraft` is everything `CreateWaveForm` collects, fully typed and
 * validated client-side, with no server calls made from this module or from
 * `CreateWaveForm` itself. The server-side agent's job is to take a
 * `CreateWaveDraft`, upload `audio.blob` to the private `audio` bucket
 * (`audioOriginalPath` in `src/lib/supabase/config.ts`), create the
 * `audio_assets` + `waves` rows, and `enqueue_audio_job()` for real
 * processing — `audio.enhancementPreset` is the preset to pass through to
 * that job; `audio.previewPeaks` is a client-only preview and must NOT be
 * stored as the Wave's real peaks (the worker regenerates those from the
 * processed file, spec §20).
 */

import type { PermissionAudience, WaveCreationType, WaveVisibility } from "@/types/domain";

import type { AdvancedEqSettings, EnhancementPresetId, ProEnhancementPresetId } from "./enhancement";

/** Categories offered on the details step. Free-form tags may be added later; this is a fixed v1 set. */
export const WAVE_CATEGORY_OPTIONS: readonly string[] = [
  "Music",
  "Talk",
  "Storytelling",
  "Comedy",
  "News",
  "Education",
  "ASMR",
  "Other",
];

/** A Wave may only be created as Recorded or Uploaded — Duet is produced by the Duet flow (spec §15), never here. */
export type CreatableCreationType = Extract<WaveCreationType, "recorded" | "uploaded">;

export interface CreateWaveDraftAudio {
  readonly creationType: CreatableCreationType;
  /** The captured/selected audio. Never uploaded by this module. */
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  /** Client-only preview peaks from `decodeToPeaks()` — the server regenerates the stored waveform. */
  readonly previewPeaks: readonly number[];
  /** AKINTI Pro (PRODUCT_V2 §4/§5): `pitch_snap`/`self_harmony` are real, gated presets as of migration `20260906120000_pro_presets_pitch.sql` — `requirePro()` in `create/actions.ts` re-checks server-side regardless of what the client sends. */
  readonly enhancementPreset: EnhancementPresetId | ProEnhancementPresetId;
  /** Set only when the user opted into the advanced EQ; `null` otherwise. */
  readonly advancedEq: AdvancedEqSettings | null;
  /** Original filename for an uploaded file; `null` for a fresh recording. */
  readonly sourceFileName: string | null;
}

export interface CreateWaveDraft {
  readonly audio: CreateWaveDraftAudio;
  readonly title: string;
  readonly description: string;
  readonly visibility: WaveVisibility;
  /** `null` means "inherit the creator's profile default" (spec §21). */
  readonly commentPermission: PermissionAudience | null;
  readonly duetPermission: PermissionAudience | null;
  /** Usernames without the leading `@`. Invites, not memberships — spec §16: never auto-add without consent. */
  readonly collaboratorUsernames: readonly string[];
  readonly categories: readonly string[];
}
