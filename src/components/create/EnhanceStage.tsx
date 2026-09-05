"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EnhancementPicker, Waveform } from "@/components/audio";
import { Button } from "@/components/ui";
import {
  REVIEW_PEAK_BUCKETS,
  decodeTake,
  renderPolishedPeaks,
  type AdvancedEqSettings,
  type EnhancementPresetId,
  type PolishMode,
} from "@/lib/audio";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/ui";

export interface EnhanceStageProps {
  blob: Blob;
  /** The take's real peaks, from the local decode. */
  peaks: readonly number[];
  preset: EnhancementPresetId;
  onPresetChange: (preset: EnhancementPresetId) => void;
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
  const reducedMotion = useReducedMotion();
  const decodedRef = useRef<AudioBuffer | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [polishedPeaks, setPolishedPeaks] = useState<readonly number[] | null>(null);
  const [mode, setMode] = useState<PolishMode>("polished");
  const [morphing, setMorphing] = useState(false);

  // Decode once, render per preset. Both are cancelled cleanly if the user
  // moves on before the render finishes.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const decoded = decodedRef.current ?? (await decodeTake(blob));
      if (cancelled) return;
      decodedRef.current = decoded;
      if (!decoded) {
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

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div
        className={cn(
          "-mx-page",
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
          label={mode === "polished" ? "Your take, polished" : "Your take, as recorded"}
        />
      </div>
      {!tracePrepared ? (
        <p className="type-body-sm measure text-ink-muted">
          We couldn&apos;t prepare a trace for this take. It is still there — the sound underneath
          this screen is real, only the picture of it is missing.
        </p>
      ) : null}

      <EnhancementPicker
        blob={blob}
        preset={preset}
        onPresetChange={onPresetChange}
        advancedEq={advancedEq}
        onAdvancedEqChange={onAdvancedEqChange}
        onModeChange={handleModeChange}
      />

      <Button size="lg" fullWidth onClick={onContinue}>
        Continue
      </Button>
    </section>
  );
}
