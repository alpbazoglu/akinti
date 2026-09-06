/**
 * "How it sounded" on the Wave page (PRODUCT_V2 §4/§5; see
 * `docs/AUDIO_ARCHITECTURE.md` "Pitch score"). Owner-only by product
 * decision, not by RLS: `audio_assets.pitch_score` is readable by anyone who
 * can view the Wave (same column-grant treatment as `enhancement_report`),
 * but a pitch report is coaching aimed at the person who made the take, not
 * public information about them — so this renders `null` for every other
 * viewer rather than gating the query itself.
 *
 * Self-contained on purpose: `page.tsx` (owned by a concurrent performance
 * pass) only gets the one import + one render line this needs — this
 * component does its own fetch rather than asking the page to thread extra
 * data through.
 */

import { PitchReport, type PitchScore } from "@/components/create/PitchReport";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface OwnerInsightsProps {
  /** Whether the current viewer is this Wave's creator — computed once already by `page.tsx`. */
  isOwner: boolean;
  audioAssetId: string;
}

function isPitchScore(value: unknown): value is PitchScore {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.score_0_100 === "number" &&
    typeof record.in_tune_ratio === "number" &&
    typeof record.median_cents_off === "number" &&
    typeof record.key_guess === "string" &&
    typeof record.notes_detected === "number"
  );
}

export async function OwnerInsights({ isOwner, audioAssetId }: OwnerInsightsProps) {
  if (!isOwner || !isSupabaseConfigured()) {
    return null;
  }

  const db = await createServerSupabaseClient();
  const { data } = await db
    .from("audio_assets")
    .select("pitch_score")
    .eq("id", audioAssetId)
    .maybeSingle();

  const pitchScore = isPitchScore(data?.pitch_score) ? data.pitch_score : null;
  if (!pitchScore) {
    return null;
  }

  return (
    <div className="akinti-page pt-2 pb-4">
      <PitchReport pitchScore={pitchScore} />
    </div>
  );
}
