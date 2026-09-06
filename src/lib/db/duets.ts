/**
 * Duet-scoped DB writes beyond the request lifecycle (`duetRequests.ts`).
 *
 * `enqueueDuetMix` already exists in `src/lib/db/audioAssets.ts`, but its
 * payload is `{ preset, reference_asset_id, offset_ms }` — no `advanced_eq`
 * (spec §19 flags this as a gap `scripts/worker.ts` needs fixed), and it
 * takes a plain `number` `offsetMs` with no floor, which cannot express
 * "the contribution started before the reference" the way this module's
 * own signed `offsetMs` (`publishDuetWaveSchema` below) needs to. Rather
 * than edit a file owned by the audio pipeline, this calls the same
 * `enqueue_audio_job` RPC directly with the fuller payload
 * `scripts/worker.ts`'s `runMixDuetJob` now expects (see
 * `src/lib/duet/ffmpegChain.ts`'s `parseMixDuetJobPayload`, which accepts
 * either shape).
 */

import type { AdvancedEqSettings } from "@/lib/audio/enhancement";
import { buildDuetTree, computeDuetTreeStats, type DuetTreeStats } from "@/lib/duet/chain";
import type { DuetSegment as ChainDuetSegment } from "@/lib/duet/ffmpegChain";
import type { AudioEnhancementPreset, AudioJobType, DuetMode, DuetTreeNode, Profile, Wave } from "@/types/domain";
import type { DuetTreeNodeRow, Json } from "@/types/database";

import { getProfilesByIds } from "./profiles";
import type { Db } from "./types";
import { unwrap } from "./types";
import { getWavesByIds } from "./waves";

export interface EnqueueDuetMixJobInput {
  /** The requester's newly recorded/uploaded take — becomes the mixed output in place. */
  contributionAssetId: string;
  /** The original Wave's audio asset, used as the reference stem. */
  originalAssetId: string;
  /**
   * Start of the contribution relative to the reference, in milliseconds.
   * May be negative (the contribution starts before the reference) — the
   * worker resolves the sign by delaying whichever stem needs it, never by
   * passing a negative value to `adelay`. Ignored (always sent as `0`) for
   * `mode: "atisma"`/`"cypher"`, which have no single "start offset" concept.
   */
  offsetMs: number;
  preset: AudioEnhancementPreset;
  advancedEq?: AdvancedEqSettings | null;
  /** Wave D. Defaults to `"layer"` — the original, only-ever mode. */
  mode?: DuetMode;
  /** Wave D, `mode: "atisma"` only — already validated (`publishDuetWaveSchema`) by the time this is called. */
  segments?: ChainDuetSegment[] | null;
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
      mode: input.mode ?? "layer",
      // `DuetSegment[]` structurally satisfies `Json` (string/number fields
      // only) but isn't nominally assignable to it — every field is a
      // plain, JSON-safe value, so this cast is not lying about the shape.
      segments: (input.mode === "atisma" ? (input.segments ?? null) : null) as unknown as Json,
    } satisfies Json,
  });
  return unwrap("enqueueDuetMixJob", result);
}

/* -------------------------------------------------------------------------- */
/* Duet chains (Wave D)                                                       */
/* -------------------------------------------------------------------------- */

export interface DuetTree {
  tree: DuetTreeNode[];
  stats: DuetTreeStats;
}

/**
 * The full Duet chain rooted at `rootWaveId`. `duet_tree` (migration
 * 20260905120300) returns only id/parent/creator/depth/mode/counts,
 * can_view_wave-filtered per row — this hydrates every id into a full
 * `Wave`/`Profile` (two batched queries, same "flat RPC list, then hydrate by
 * id" shape as `listCollaboratorsForWaves`/`listSavedWaveIds` in
 * `src/lib/db/waves.ts`) and hands the result to the pure builders in
 * `src/lib/duet/chain.ts`.
 */
export async function getDuetTree(db: Db, rootWaveId: string): Promise<DuetTree> {
  const result = await db.rpc("duet_tree", { p_root_wave_id: rootWaveId });
  const rows: DuetTreeNodeRow[] = unwrap("getDuetTree", { data: result.data ?? [], error: result.error });

  if (rows.length === 0) {
    return { tree: [], stats: computeDuetTreeStats([]) };
  }

  const waveIds = rows.map((r) => r.id);
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
  const [waves, creators] = await Promise.all([
    getWavesByIds(db, waveIds),
    getProfilesByIds(db, creatorIds),
  ]);

  const wavesById = new Map<string, Wave>(waves.map((w) => [w.id, w]));
  const creatorsById = new Map<string, Profile>(creators.map((p) => [p.id, p]));

  const tree = buildDuetTree(
    rows.map((r) => ({
      waveId: r.id,
      parentWaveId: r.parent_wave_id,
      creatorId: r.creator_id,
      depth: r.depth,
    })),
    wavesById,
    creatorsById,
  );

  return { tree, stats: computeDuetTreeStats(tree) };
}
