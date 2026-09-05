/**
 * Signatures for the Explore creator tiles (§10, SCREENS.md §3).
 *
 * A creator's tile artwork is a trace made of their own recent Waves. That
 * needs peak data, which lives on `audio_assets`, so this reads the recent
 * public Waves for the whole strip in one query and then resolves the assets
 * for the handful it actually draws.
 *
 * Bounded on purpose: `SOURCE_WAVES_PER_CREATOR` caps how many Waves per
 * creator contribute, so the strip costs a fixed, small number of point reads
 * however many creators are on screen. The full twelve-Wave signature of §10
 * wants a server-side aggregate; until there is one, the tile draws what it
 * can actually prove and the dormant tick row when it can prove nothing.
 */

import { composeSignature } from "@/components/feed";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { listWavesByCreatorIds } from "@/lib/db/waves";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Waves per creator that contribute to a strip signature. */
const SOURCE_WAVES_PER_CREATOR = 3;

/** Upper bound on asset reads for the whole strip, whatever it is asked for. */
const MAX_ASSET_READS = 18;

/**
 * A signature per creator id. Creators with no published audio are simply
 * absent from the map, and their tile draws the dormant tick row.
 */
export async function loadCreatorSignatures(
  db: SupabaseServerClient,
  creatorIds: readonly string[],
): Promise<Map<string, number[]>> {
  const signatures = new Map<string, number[]>();
  if (creatorIds.length === 0) {
    return signatures;
  }

  const page = await listWavesByCreatorIds(db, [...creatorIds], {
    limit: creatorIds.length * SOURCE_WAVES_PER_CREATOR,
  });

  const byCreator = new Map<string, { waveId: string; assetId: string }[]>();
  for (const wave of page.items) {
    const list = byCreator.get(wave.creatorId) ?? [];
    if (list.length >= SOURCE_WAVES_PER_CREATOR) continue;
    list.push({ waveId: wave.id, assetId: wave.audioAssetId });
    byCreator.set(wave.creatorId, list);
  }

  const wanted: { creatorId: string; assetId: string }[] = [];
  for (const [creatorId, waves] of byCreator) {
    for (const wave of waves) {
      if (wanted.length >= MAX_ASSET_READS) break;
      wanted.push({ creatorId, assetId: wave.assetId });
    }
  }

  const assets = await Promise.all(wanted.map((entry) => getAudioAssetById(db, entry.assetId)));

  const peaksByCreator = new Map<string, number[][]>();
  wanted.forEach((entry, index) => {
    const asset = assets[index];
    const stored = asset?.peaks?.data;
    // Only real peak data composes a signature. A placeholder shape would be
    // a waveform that stands for no audio at all (§6.2, §12.32).
    if (!asset || !stored || stored.length === 0) return;
    const list = peaksByCreator.get(entry.creatorId) ?? [];
    list.push(resolveWavePeaks(stored, asset.id, asset.peaks?.bits));
    peaksByCreator.set(entry.creatorId, list);
  });

  for (const [creatorId, sets] of peaksByCreator) {
    const signature = composeSignature(sets);
    if (signature.length > 0) {
      signatures.set(creatorId, signature);
    }
  }

  return signatures;
}
