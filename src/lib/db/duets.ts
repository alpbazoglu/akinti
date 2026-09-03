/**
 * Duet-scoped DB writes beyond the request lifecycle (`duetRequests.ts`).
 *
 * `enqueueDuetMix` already exists in `src/lib/db/audioAssets.ts`, but its
 * payload is `{ preset, reference_asset_id, offset_ms }` — no `advanced_eq`
 * (spec §19 flags this as a gap `scripts/worker.ts` needs fixed) and
 * `offsetMs` is validated `>= 0` there (`enqueueDuetMixSchema` in
 * `src/lib/validation/audio.ts`), which cannot express "the contribution
 * started before the reference." Rather than edit a file owned by the audio
 * pipeline, this calls the same `enqueue_audio_job` RPC directly with the
 * fuller payload `scripts/worker.ts`'s `runMixDuetJob` now expects (see
 * `src/lib/duet/ffmpegChain.ts`'s `parseMixDuetJobPayload`, which accepts
 * either shape).
 */

import type { AdvancedEqSettings } from "@/lib/audio/enhancement";
import type { AudioEnhancementPreset, AudioJobType } from "@/types/domain";
import type { Json } from "@/types/database";

import type { Db } from "./types";
import { unwrap } from "./types";

export interface EnqueueDuetMixJobInput {
  /** The requester's newly recorded/uploaded take — becomes the mixed output in place. */
  contributionAssetId: string;
  /** The original Wave's audio asset, used as the reference stem. */
  originalAssetId: string;
  /**
   * Start of the contribution relative to the reference, in milliseconds.
   * May be negative (the contribution starts before the reference) — the
   * worker resolves the sign by delaying whichever stem needs it, never by
   * passing a negative value to `adelay`.
   */
  offsetMs: number;
  preset: AudioEnhancementPreset;
  advancedEq?: AdvancedEqSettings | null;
}

export async function enqueueDuetMixJob(db: Db, input: EnqueueDuetMixJobInput): Promise<number> {
  const result = await db.rpc("enqueue_audio_job", {
    p_audio_asset_id: input.contributionAssetId,
    p_job_type: "mix_duet" satisfies AudioJobType,
    p_payload: {
      preset: input.preset,
      reference_asset_id: input.originalAssetId,
      offset_ms: Math.round(input.offsetMs),
      advanced_eq: input.advancedEq ?? null,
    } satisfies Json,
  });
  return unwrap("enqueueDuetMixJob", result);
}
