"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { EnhancementPicker, Waveform } from "@/components/audio";
import { ProGate } from "@/components/pro/ProGate";
import { useProStatus } from "@/components/pro/useProStatus";
import { Button } from "@/components/ui";
import {
  PRO_ENHANCEMENT_PRESETS,
  REVIEW_PEAK_BUCKETS,
  decodeTake,
  isProOnlyEnhancementPresetId,
  renderPolishedPeaks,
  type AdvancedEqSettings,
  type EnhancementPresetId,
  type PolishMode,
  type ProEnhancementPresetId,
} from "@/lib/audio";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/ui";

import { useStageShortcuts } from "./useStageShortcuts";

/**
 * Translated parallel to `PRO_ENHANCEMENT_PRESETS`'s English `label`/
 * `description` (`@/lib/audio`, English-only — same reasoning as
 * `EnhancementPicker.tsx`'s `PRESET_MESSAGE_KEY`).
 */
const PRO_PRESET_MESSAGE_KEY = {
  pitch_snap: { label: "labelPitchSnap", description: "descriptionPitchSnap" },
  self_harmony: { label: "labelSelfHarmony", description: "descriptionSelfHarmony" },
} as const satisfies Record<ProEnhancementPresetId, { label: string; description: string }>;

export interface EnhanceStageProps {
  blob: Blob;
  /** The take's real peaks, from the local decode. */
  peaks: readonly number[];
  preset: EnhancementPresetId | ProEnhancementPresetId;
  onPresetChange: (preset: EnhancementPresetId | ProEnhancementPresetId) => void;
  advancedEq: AdvancedEqSettings | null;
  onAdvancedEqChange: (eq: AdvancedEqSettings | null) => void;
  onContinue: () => void;
  className?: string;
}

/**
 * Enhance (`docs/design/SCREENS.md` §4.4).
 *
 * The trace above the A/B pair is the take's real amplitude, and when the
 * toggle flips to Polished it is replaced by the **rendered** amplitude of the
 * processed audio, not by a decorated version of the same shape. §6.3 permits
 * exactly one animated redraw of the waterline — this 180ms morph — "because
 * there the change *is* the content", and that is only true if the second
 * trace is real (§12.32).
 *
 * When the take is too long to render offline on a phone, or the browser will
 * not do it, the trace simply does not change. That is the honest outcome:
 * the sound is still different, and inventing a shape to prove it would be
 * the fake waveform this system refuses.
 *
 * There is no "Skip": Natural is already selected and already applied, so the
 * Continue key is the skip. Two controls that mean the same thing is §12.40.
 */
export function EnhanceStage({
  blob,
  peaks,
  preset,
  onPresetChange,
  advancedEq,
  onAdvancedEqChange,
  onContinue,
  className,
}: EnhanceStageProps) {
  const t = useTranslations("EnhanceStage");
  const tProPresets = useTranslations("ProEnhancementPresets");
  const reducedMotion = useReducedMotion();
  const decodedRef = useRef<AudioBuffer | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [polishedPeaks, setPolishedPeaks] = useState<readonly number[] | null>(null);
  const [mode, setMode] = useState<PolishMode>("polished");
  const [morphing, setMorphing] = useState(false);
  // The paywall moment (PRODUCT_V2 §4/§5): which Pro-only sound's row was
  // tapped, so `ProGate`'s opening line can name it — `null` means closed.
  // Only ever opened for a non-Pro caller now — see the Pro rows below.
  const [proGateFeature, setProGateFeature] = useState<string | null>(null);
  const { isPro, loading: proStatusLoading } = useProStatus();
  const proPresetSelected = isProOnlyEnhancementPresetId(preset);

  // Decode once, render per preset. Both are cancelled cleanly if the user
  // moves on before the render finishes. `pitch_snap`/`self_harmony` never
  // get a local render here — there is no honest local approximation of
  // server-side pitch correction/harmony, and faking one would be exactly
  // the invented waveform DESIGN.md §12.32 refuses (see the Pro rows' "Preview
  // after processing" note below instead).
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const decoded = decodedRef.current ?? (await decodeTake(blob));
      if (cancelled) return;
      decodedRef.current = decoded;
      if (!decoded || isProOnlyEnhancementPresetId(preset)) {
        setPolishedPeaks(null);
        return;
      }
      const rendered = await renderPolishedPeaks(
        decoded,
        preset,
        advancedEq,
        REVIEW_PEAK_BUCKETS,
      );
      if (!cancelled) setPolishedPeaks(rendered);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [blob, preset, advancedEq]);

  // The one permitted trace animation: a 180ms morph when the audible branch
  // changes, and nothing at all under `prefers-reduced-motion` (§7.3). This
  // lives in the event handler that changes `mode`, not in an effect keyed
  // on `mode`, so there is no synchronous `setState` inside an effect body.
  const handleModeChange = useCallback(
    (next: PolishMode) => {
      setMode(next);
      if (reducedMotion) return;
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
      setMorphing(true);
      morphTimerRef.current = setTimeout(() => {
        setMorphing(false);
        morphTimerRef.current = null;
      }, 180);
    },
    [reducedMotion],
  );

  useEffect(() => {
    return () => {
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
    };
  }, []);

  const trace = mode === "polished" && polishedPeaks ? polishedPeaks : peaks;
  // A real decode failure, never a fake shape (DESIGN.md §12.32): the trace
  // goes dormant instead of drawing invented amplitudes.
  const tracePrepared = trace.length > 0;

  // "Enter = continue" (`DESIGN_V3_DESKTOP.md`) — no "R = retake" here:
  // Enhance has no re-record concept of its own, "Start over" is its own
  // ghost button below, unchanged.
  useStageShortcuts({ onContinue });

  return (
    <section className={cn("flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div
          className={cn(
            "-mx-page lg:mx-0",
            !reducedMotion && "transition-opacity duration-[--dur-morph] ease-[--ease-enter]",
            morphing && !reducedMotion && "opacity-70",
          )}
        >
          <Waveform
            peaks={trace}
            height={56}
            state={tracePrepared ? "unplayed" : "dormant"}
            readOnly
            fullBleed
            label={mode === "polished" ? t("yourTakePolished") : t("yourTakeAsRecorded")}
          />
        </div>
        {!tracePrepared ? (
          <p className="type-body-sm measure text-ink-muted">{t("couldNotPrepareTrace")}</p>
        ) : null}
        {tracePrepared && proPresetSelected ? (
          <p className="type-body-sm measure text-ink-muted">{t("previewAfterProcessing")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 lg:w-[420px] lg:shrink-0">
        <EnhancementPicker
          blob={blob}
          preset={proPresetSelected ? "natural" : preset}
          onPresetChange={onPresetChange}
          advancedEq={advancedEq}
          onAdvancedEqChange={onAdvancedEqChange}
          onModeChange={handleModeChange}
        />

        {/* AKINTI Pro sounds (PRODUCT_V2 §4/§5): the same row treatment as
            the six free sounds above (including their `lg:` card look), just
            marked "Pro" in sand — the one accent this brand reserves for
            Pro/backing-track/Cypher marks. A non-Pro caller tapping one never
            selects it — it opens the paywall moment instead (`ProGate`), the
            sheet that explains AKINTI Pro and links to the real Pro screen.
            There is no modal on app open, ever: this only ever opens from
            this tap. A Pro caller selects it directly, exactly like the six
            free sounds above — there is real DSP behind both now (the
            sidecar's /pitch-snap and /harmony), just no honest local preview
            for it yet (see "Preview after processing" above). */}
        <div
          role="group"
          aria-label={t("akintiProSounds")}
          className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-3"
        >
          {PRO_ENHANCEMENT_PRESETS.map((item) => {
            const selected = preset === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={proStatusLoading}
                onClick={() =>
                  isPro ? onPresetChange(item.id) : setProGateFeature(tProPresets(PRO_PRESET_MESSAGE_KEY[item.id].label))
                }
                className={cn(
                  "flex h-14 items-center gap-4 border-t border-hairline px-3 text-left",
                  "transition-colors duration-[--dur-micro]",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                  "lg:h-auto lg:flex-col lg:items-start lg:gap-1.5 lg:rounded-card lg:border lg:border-sand-deep/60 lg:px-4 lg:py-3.5",
                  selected
                    ? "bg-paper-sunk lg:border-sand-deep lg:bg-sand/10"
                    : "hover:bg-paper-sunk/50 lg:hover:bg-sand/5",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3 shrink-0 rounded-full border lg:hidden",
                    selected ? "border-ink bg-ink" : "border-hairline-strong",
                  )}
                />
                <span className="type-subhead min-w-28 text-ink lg:min-w-0">
                  {tProPresets(PRO_PRESET_MESSAGE_KEY[item.id].label)}
                </span>
                <span className="type-caption truncate text-ink-subtle lg:whitespace-normal">
                  {tProPresets(PRO_PRESET_MESSAGE_KEY[item.id].description)}
                </span>
                <span className="type-caption ml-auto shrink-0 text-sand-deep lg:ml-0">{t("pro")}</span>
              </button>
            );
          })}
        </div>

        <ProGate
          open={proGateFeature !== null}
          onClose={() => setProGateFeature(null)}
          featureLabel={proGateFeature ?? undefined}
        />

        <Button size="lg" fullWidth onClick={onContinue}>
          {t("continueAction")}
        </Button>

        <p className="type-caption hidden items-center gap-1.5 text-ink-subtle lg:flex">
          <kbd className="rounded-label border border-hairline-strong bg-elevation-2 px-1.5 py-0.5 type-mono-sm">
            {t("enterKey")}
          </kbd>
          {t("enterToContinueHint")}
        </p>
      </div>
    </section>
  );
}
