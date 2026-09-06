"use client";

import { useTranslations } from "next-intl";

import { CLIPPING_DB, formatDb, formatPitch, type PitchReading } from "@/lib/audio";
import { cn } from "@/lib/ui";

/**
 * The two live readouts on the record screen (`docs/design/SCREENS.md` §4.2).
 *
 * Both are numbers in Martian Mono, tabular, because that is what a readout is
 * in this system (§3.4). Neither is a filled progress bar with a grey track
 * (§12.30): the level is "a number in mono plus 3 ticks", and the pitch is a
 * note plus a signed cents figure with a single ink tick showing which side of
 * the note you are on.
 *
 * Signal appears on the level only when the input is within 3 dB of full
 * scale, which is a genuine audio-live state and the one thing on this screen
 * worth interrupting a performance for (§4, §12.3). The pitch meter is ink
 * throughout: a second accent, or a red "wrong note", would turn a tuning aid
 * into a grade, and this product does not grade people (§12.35).
 */

export interface LevelReadoutProps {
  /** dBFS, from `LiveMonitor`. */
  db: number;
  /** Linear RMS `0..1`, for the three ticks. */
  rms: number;
  className?: string;
}

/** Three ticks, at a third, two thirds and full scale. */
const TICK_THRESHOLDS = [0.18, 0.45, 0.78];

export function LevelReadout({ db, rms, className }: LevelReadoutProps) {
  const t = useTranslations("Readouts");
  const hot = db >= CLIPPING_DB;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span aria-hidden="true" className="flex h-4 items-end gap-1">
        {TICK_THRESHOLDS.map((threshold, index) => (
          <span
            key={threshold}
            style={{ height: `${40 + index * 30}%` }}
            className={cn(
              "w-0.5",
              rms >= threshold ? (hot ? "bg-signal" : "bg-ink") : "bg-wave-rest",
            )}
          />
        ))}
      </span>
      <span
        className={cn("type-mono-sm", hot ? "text-signal" : "text-ink-subtle")}
        aria-label={t("inputLevel", { level: formatDb(db) })}
      >
        {formatDb(db)}
      </span>
      {hot ? <span className="type-caption text-signal-deep">{t("tooLoud")}</span> : null}
    </div>
  );
}

export interface PitchMeterProps {
  /** `null` whenever the detector is not confident: the meter goes quiet. */
  pitch: PitchReading | null;
  className?: string;
}

/** Half the meter's width in cents: a semitone either side of the note. */
const METER_RANGE_CENTS = 50;

export function PitchMeter({ pitch, className }: PitchMeterProps) {
  // The rail keeps its height whether or not a note is detected, so the layout
  // does not jump every time the singer takes a breath.
  const offset = pitch ? Math.max(-1, Math.min(1, pitch.cents / METER_RANGE_CENTS)) : 0;

  return (
    <div className={cn("flex items-center gap-3", className)} aria-live="off">
      <span className="relative flex h-4 w-16 items-center" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
        <span className="absolute left-1/2 h-3 w-px -translate-x-1/2 bg-hairline-strong" />
        {pitch ? (
          <span
            className="absolute h-4 w-0.5 bg-ink"
            style={{ left: `calc(50% + ${offset * 50}% - 1px)` }}
          />
        ) : null}
      </span>
      {/* Empty, not a placeholder glyph: an em dash is banned in any
          user-visible string (§12.22) and a "0" would be a lie about pitch. */}
      <span className="type-mono-sm min-w-20 text-ink-muted">
        {pitch ? formatPitch(pitch) : ""}
      </span>
    </div>
  );
}
