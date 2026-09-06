"use client";

/**
 * "How it sounded" (PRODUCT_V2 §4: "Pitch score / vocal coach ... shown
 * after recording as encouragement, not judgment"; DESIGN.md §12: no
 * gamification, never print a zero metric, no exclamation marks, no
 * comparison to others).
 *
 * Reads `audio_assets.pitch_score` (`docs/AUDIO_ARCHITECTURE.md` "Pitch
 * score") — a plain object, not a class or a grade. This component turns
 * that into one honest sentence, an optional numeral, a small trace of how
 * pitch tracked over the take, and one concrete tip. Never a star rating,
 * never a letter grade, never "better than N% of singers" — those are the
 * comparisons PRODUCT_V2 explicitly rules out.
 *
 * `null`/absent input renders nothing — a Wave whose pitch score was never
 * computed (sidecar was down, or it's a backing-track instrumental) gets no
 * block at all, not a placeholder or a fake "processing" state.
 */

import { useTranslations } from "next-intl";

import { Waveform } from "@/components/audio";

/** Matches the jsonb shape `set_audio_asset_pitch_score()` writes onto `audio_assets.pitch_score` — see the migration's column comment. */
export interface PitchScore {
  score_0_100: number;
  in_tune_ratio: number;
  median_cents_off: number;
  key_guess: string;
  notes_detected: number;
  /**
   * Downsampled cents-off-per-second, added by `scripts/worker.ts` (not one
   * of the five fields the schema doc calls canonical) purely to back the
   * mini trace below without a second query. Absent on any score computed
   * before this field existed — the trace is simply omitted then, never
   * invented.
   */
  cents_trace?: number[];
}

const IN_TUNE_RATIO_HIGH = 0.85;
const IN_TUNE_RATIO_MID = 0.6;
/** A half-take average swing below this (in cents) is noise, not a real drift to call out. */
const DRIFT_NOISE_FLOOR_CENTS = 8;
/** One semitone — the ceiling the mini trace's bar height maps to. */
const TRACE_MAX_CENTS = 100;

function formatKeyGuess(keyGuess: string): string {
  const trimmed = keyGuess.trim();
  if (trimmed.toLowerCase().endsWith(" major")) {
    return trimmed.slice(0, -" major".length);
  }
  return trimmed;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Which half of the take drifted more, if either did meaningfully. */
function driftedHalf(trace: readonly number[]): "first" | "second" | null {
  if (trace.length < 4) return null;
  const mid = Math.floor(trace.length / 2);
  const firstAvg = average(trace.slice(0, mid));
  const secondAvg = average(trace.slice(mid));
  if (Math.abs(secondAvg - firstAvg) < DRIFT_NOISE_FLOOR_CENTS) return null;
  return secondAvg > firstAvg ? "second" : "first";
}

type PitchReportTranslator = ReturnType<typeof useTranslations<"PitchReport">>;

function describeSentence(pitch: PitchScore, t: PitchReportTranslator): string {
  if (pitch.notes_detected === 0) {
    return t("noClearReading");
  }
  const key = formatKeyGuess(pitch.key_guess);
  const half = pitch.cents_trace ? driftedHalf(pitch.cents_trace) : null;
  if (half === "first") {
    return t("driftedFirstHalf", { key });
  }
  if (half === "second") {
    return t("driftedSecondHalf", { key });
  }
  if (pitch.in_tune_ratio >= IN_TUNE_RATIO_HIGH) {
    return t("mostlyInTune", { key });
  }
  if (pitch.in_tune_ratio >= IN_TUNE_RATIO_MID) {
    return t("closeToKey", { key });
  }
  return t("driftedThroughout", { key });
}

function pickTip(pitch: PitchScore, t: PitchReportTranslator): string {
  if (pitch.notes_detected === 0) {
    return t("tipQuieterRoom");
  }
  if (pitch.in_tune_ratio >= IN_TUNE_RATIO_HIGH) {
    return t("tipWarmUp");
  }
  if (pitch.median_cents_off > 50) {
    return t("tipHoldNotes");
  }
  return t("tipHumMelody");
}

/** Cents-off values, 0..~150+, mapped to the `0..1` amplitude a trace draws. */
function traceAmplitudes(trace: readonly number[]): number[] {
  return trace.map((value) => Math.min(1, Math.max(0, value / TRACE_MAX_CENTS)));
}

export interface PitchReportProps {
  pitchScore: PitchScore | null;
  className?: string;
}

export function PitchReport({ pitchScore, className }: PitchReportProps) {
  const t = useTranslations("PitchReport");
  if (!pitchScore) return null;

  const sentence = describeSentence(pitchScore, t);
  const tip = pickTip(pitchScore, t);
  const showScore = pitchScore.score_0_100 >= 1;
  const trace = pitchScore.notes_detected > 0 ? pitchScore.cents_trace : undefined;

  return (
    <div className={className}>
      <div className="akinti-rail items-start border-t border-hairline pt-4">
        <span aria-hidden="true" className="flex justify-end pt-1.5">
          <span className="size-2 rounded-full bg-tide" />
        </span>
        <div className="flex flex-col gap-3">
          <p className="type-caption-strong text-ink-subtle">{t("howItSounded")}</p>
          <div className="flex items-baseline gap-3">
            <p className="type-body-sm measure text-ink">{sentence}</p>
            {showScore ? (
              <span className="type-mono-sm shrink-0 tabular-nums text-ink">
                {Math.round(pitchScore.score_0_100)}
              </span>
            ) : null}
          </div>
          {trace && trace.length > 0 ? (
            <Waveform
              peaks={traceAmplitudes(trace)}
              height={24}
              state="unplayed"
              readOnly
              hue="current"
              label={t("howPitchTracked")}
            />
          ) : null}
          <p className="type-caption text-ink-subtle">{tip}</p>
        </div>
      </div>
    </div>
  );
}
