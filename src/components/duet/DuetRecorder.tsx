"use client";

/**
 * The Duet recorder (spec §15 deliverable 3): play the original through a
 * dedicated `<audio>` element while recording the contribution
 * (`useRecorder`, `src/lib/audio/recorder.ts`), measure the sync offset,
 * expose a manual +/-500ms nudge, preview both together client-side, pick an
 * enhancement preset, then publish.
 *
 * This intentionally does NOT use the global playback store
 * (`usePlaybackStore`) — that store enforces "only one Wave plays at a time"
 * app-wide (spec §12), which is the wrong model for a recorder that needs
 * the original playing WHILE something else (the mic) is live. Instead this
 * owns a local `<audio>` element directly, the same pattern
 * `EnhancementPicker.tsx` already uses for its A/B preview, including
 * calling `store.pause()` once before it starts so it still respects "only
 * one Wave plays at a time" everywhere ELSE in the app.
 *
 * Publish sequence mirrors `CreateFlow.tsx`'s `runPublish`: `createUploadTicket`
 * -> upload the recorded blob -> `finalizeUpload` -> `publishDuetWave`
 * (`src/app/(app)/create/duetActions.ts`), reusing the first two actions
 * unmodified from `src/app/(app)/create/actions.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Pause, Play, RotateCcw, Square } from "lucide-react";

import { AudioPreview, EnhancementPicker, Waveform } from "@/components/audio";
import { Button, ErrorState } from "@/components/ui";
import {
  decodeToPeaks,
  useRecorder,
  usePlaybackStore,
  type AdvancedEqSettings,
  type EnhancementPresetId,
} from "@/lib/audio";
import { OFFSET_NUDGE_STEP_MS, computeBaseOffsetMs, computePreviewSchedule, resolveOffsetMs } from "@/lib/duet/sync";
import { AUDIO_BUCKET } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/config/routes";
import { formatDuration } from "@/lib/ui";

import { createUploadTicket, finalizeUpload } from "@/app/(app)/create/actions";
import { publishDuetWave } from "@/app/(app)/create/duetActions";

const PREVIEW_PEAK_BUCKETS = 72;

type Phase =
  | "ready" /* original loaded, not yet recording */
  | "recording"
  | "recorded" /* take captured, offset/preset/publish step */
  | "publishing"
  | "published"
  | "error";

/** The only piece of the state machine that is real React state — see the file-header note near its `useState` call. */
type Outcome = "idle" | "publishing" | "published" | "error";

export interface DuetRecorderProps {
  requestId: string;
  originalAssetId: string;
  originalTitle: string;
  originalCreatorUsername: string;
  originalPeaks: readonly number[];
  originalDurationMs: number;
  className?: string;
}

export function DuetRecorder({
  requestId,
  originalAssetId,
  originalTitle,
  originalCreatorUsername,
  originalPeaks,
  originalDurationMs,
  className,
}: DuetRecorderProps) {
  const router = useRouter();
  const store = usePlaybackStore();

  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewOriginalRef = useRef<HTMLAudioElement | null>(null);
  const previewTakeRef = useRef<HTMLAudioElement | null>(null);
  const previewTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalLoadError, setOriginalLoadError] = useState<string | null>(null);
  const [originalPlaying, setOriginalPlaying] = useState(false);

  // `phase` (below) is intentionally NOT its own `useState`: "ready" /
  // "recording" / "recorded" are entirely derivable from `recorder.state`
  // every render, and mirroring them into a parallel state variable via a
  // `useEffect` is exactly the anti-pattern
  // https://react.dev/learn/you-might-not-need-an-effect warns against —
  // it also fights `react-hooks/set-state-in-effect`. Only the publish
  // outcome ("publishing"/"published"/"error") is genuine state, since it
  // is driven by `handlePublish`, an event handler, not a render-time
  // derivation of anything.
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [baseOffsetMs, setBaseOffsetMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [previewPeaks, setPreviewPeaks] = useState<readonly number[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [preset, setPreset] = useState<EnhancementPresetId>("studio");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);
  const [title, setTitle] = useState(`Duet with @${originalCreatorUsername}`);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [originalLoadAttempt, setOriginalLoadAttempt] = useState(0);

  const recorder = useRecorder();

  // Resolve a signed playback URL for the original — on mount, and again
  // whenever `retryLoadOriginal` bumps `originalLoadAttempt` (spec §38:
  // "original unavailable" needs a real retry, not a dead end). This
  // recorder needs the original playable immediately, unlike a feed card's
  // lazy-on-first-click resolution.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audio/${originalAssetId}/url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`playback url request failed (${response.status})`);
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error("playback url response missing url");
        if (!cancelled) setOriginalUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setOriginalLoadError("The original Wave's audio could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [originalAssetId, originalLoadAttempt]);

  // The retry button (an event handler, not an effect) is the one place that
  // clears a stale error and re-triggers the load effect above.
  const retryLoadOriginal = () => {
    setOriginalUrl(null);
    setOriginalLoadError(null);
    setOriginalLoadAttempt((n) => n + 1);
  };

  // Every render's "ready"/"recording"/"recorded" phase, derived straight
  // from the recorder store rather than mirrored into a `useEffect` (see the
  // note by the `outcome` state above).
  const phase: Phase =
    outcome !== "idle"
      ? outcome
      : recorder.state.status === "recording"
        ? "recording"
        : recorder.state.status === "stopped" && recorder.state.result
          ? "recorded"
          : "ready";

  // Measure the base offset the instant the recorder actually starts
  // capturing — not at the button click, which races microphone permission
  // latency (see src/lib/duet/sync.ts's file header). `prevStatusRef` (not
  // `phase`, which would be circular now that it's derived FROM this same
  // status) is what makes this a one-shot "just transitioned" effect rather
  // than re-measuring on every render while still recording.
  const prevRecorderStatusRef = useRef(recorder.state.status);
  useEffect(() => {
    const prevStatus = prevRecorderStatusRef.current;
    prevRecorderStatusRef.current = recorder.state.status;
    if (recorder.state.status === "recording" && prevStatus !== "recording") {
      const elapsedMs = (originalAudioRef.current?.currentTime ?? 0) * 1000;
      setBaseOffsetMs(computeBaseOffsetMs(elapsedMs));
    }
  }, [recorder.state.status]);

  // Pausing the original the moment recording stops is a real DOM side
  // effect (synchronizing the audio element with the recorder's state) —
  // exactly what an effect is for, and it sets no state at all:
  // `originalPlaying` is kept in sync by the element's own `onPause` handler
  // below (it fires for every real pause, this one included), and `phase`
  // above already reflects "recorded" the instant `recorder.state` does.
  useEffect(() => {
    if (recorder.state.status === "stopped" && recorder.state.result) {
      originalAudioRef.current?.pause();
    }
  }, [recorder.state.status, recorder.state.result]);

  // Decodes local preview peaks for whatever take is currently recorded.
  // No corresponding "reset to null on retake" branch is needed: `phase`
  // resets to "ready" the instant `retake()` runs (see below), which already
  // hides every bit of UI that reads `previewPeaks` — so there is nothing to
  // synchronize when `recorder.state.result` goes back to `null`.
  useEffect(() => {
    const result = recorder.state.result;
    if (!result) return;
    let cancelled = false;
    void decodeToPeaks(result.blob, PREVIEW_PEAK_BUCKETS)
      .then((peaks) => {
        if (!cancelled) setPreviewPeaks(peaks);
      })
      .catch(() => {
        if (!cancelled) setPreviewPeaks(new Array(PREVIEW_PEAK_BUCKETS).fill(0.2));
      });
    return () => {
      cancelled = true;
    };
  }, [recorder.state.result]);

  // Never leave a `<audio>` element playing after this recorder unmounts
  // (e.g. the user navigates away mid-preview) — pausing on unmount is not
  // guaranteed by React removing the DOM node alone in every browser.
  // Deliberately reads `.current` inside the cleanup itself rather than
  // copying it to a local at mount time: `previewOriginalRef`/
  // `previewTakeRef` only attach once recording finishes (they're behind a
  // `phase === "recorded"` conditional), well after this effect's single
  // mount-time run — a local captured at mount would always be `null` for
  // those two.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: reading `.current` live is intentional here
      originalAudioRef.current?.pause();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: reading `.current` live is intentional here
      previewOriginalRef.current?.pause();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: reading `.current` live is intentional here
      previewTakeRef.current?.pause();
    };
  }, []);

  const offsetMs = useMemo(() => resolveOffsetMs(baseOffsetMs, nudgeMs), [baseOffsetMs, nudgeMs]);

  // One object URL per recorded take, released the moment it's replaced or
  // the component unmounts (mirrors AudioPreview.tsx's own object-URL
  // lifecycle) — the inline preview `<audio>` element needs a stable `src`
  // rather than a fresh URL minted on every render.
  const takeResult = recorder.state.result;
  const takeUrl = useMemo(() => (takeResult ? URL.createObjectURL(takeResult.blob) : null), [takeResult]);
  useEffect(() => {
    return () => {
      if (takeUrl) URL.revokeObjectURL(takeUrl);
    };
  }, [takeUrl]);

  const startRecording = () => {
    // Spec §38 "original unavailable": recording against nothing produces a
    // meaningless offset and an unusable Duet — refuse to start until the
    // original has actually loaded, rather than silently recording a solo
    // take with `baseOffsetMs` stuck at 0.
    if (!originalAudioRef.current || !originalUrl || originalLoadError) return;
    store.pause(); // Respect "only one Wave plays at a time" for the rest of the app.
    originalAudioRef.current.currentTime = 0;
    void originalAudioRef.current.play();
    setOriginalPlaying(true);
    recorder.start();
  };

  const stopRecording = () => {
    recorder.stop();
  };

  const retake = () => {
    stopPreview();
    recorder.retake();
    setBaseOffsetMs(0);
    setNudgeMs(0);
    // Clears a previous failed-publish outcome too, not just resetting
    // "recorded" back to "ready" — both are the same `outcome` reset now
    // that `phase` is derived (see the note above).
    setOutcome("idle");
  };

  const stopPreview = () => {
    for (const timer of previewTimers.current) clearTimeout(timer);
    previewTimers.current = [];
    previewOriginalRef.current?.pause();
    previewTakeRef.current?.pause();
    setPreviewing(false);
  };

  const startPreview = () => {
    const originalEl = previewOriginalRef.current;
    const takeEl = previewTakeRef.current;
    if (!originalEl || !takeEl) return;
    store.pause();
    stopPreview();

    const schedule = computePreviewSchedule(offsetMs);
    originalEl.currentTime = 0;
    takeEl.currentTime = 0;

    if (schedule.referenceDelayMs === 0) {
      void originalEl.play();
    } else {
      previewTimers.current.push(setTimeout(() => void originalEl.play(), schedule.referenceDelayMs));
    }
    if (schedule.contributionDelayMs === 0) {
      void takeEl.play();
    } else {
      previewTimers.current.push(setTimeout(() => void takeEl.play(), schedule.contributionDelayMs));
    }
    setPreviewing(true);
  };

  useEffect(() => {
    return () => {
      for (const timer of previewTimers.current) clearTimeout(timer);
    };
  }, []);

  const handlePublish = async () => {
    const result = recorder.state.result;
    if (!result) return;
    setPublishError(null);
    setOutcome("publishing");
    stopPreview();

    const ticket = await createUploadTicket({
      mimeType: result.mimeType,
      sizeBytes: result.blob.size,
      durationMs: result.durationMs,
      // `createUploadTicketSchema` only accepts "recorded" | "uploaded" —
      // there is no "duet" value at the audio_assets layer (the Wave-level
      // `creation_type` is what actually carries "duet"). "recorded" is the
      // closest fit for a fresh mic capture; documented in the final report.
      creationType: "recorded",
      enhancementPreset: preset,
    });
    if (!ticket.ok) {
      setPublishError(ticket.error);
      setOutcome("error");
      return;
    }

    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, result.blob, { contentType: result.mimeType });
      if (uploadError) {
        setPublishError("The upload didn't complete. Try again.");
        setOutcome("error");
        return;
      }
    } catch {
      setPublishError("The upload didn't complete. Check your connection and try again.");
      setOutcome("error");
      return;
    }

    // `skipAutoProcessing: true` — this is a Duet contribution stem. The
    // `mix_duet` job enqueued below (via `publishDuetWave`) applies `preset`/
    // `advancedEq` to it as part of the mixdown; enqueuing the ordinary
    // standalone `process_audio` job too would race `mix_duet` for the same
    // `audio_assets` row (see the file header of `create/duetActions.ts` and
    // `docs/DUET_SPEC.md`).
    const finalized = await finalizeUpload(ticket.assetId, advancedEq ?? undefined, true);
    if (!finalized.ok) {
      setPublishError(finalized.error);
      setOutcome("error");
      return;
    }

    const published = await publishDuetWave({
      requestId,
      contributionAssetId: ticket.assetId,
      offsetMs,
      title: title.trim() || `Duet with @${originalCreatorUsername}`,
      visibility: "everyone",
      preset,
      advancedEq,
    });
    if (!published.ok) {
      setPublishError(published.error);
      setOutcome("error");
      return;
    }

    setOutcome("published");
    router.push(routes.wave(published.waveId));
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Original — &ldquo;{originalTitle}&rdquo;</h2>
          <audio
            ref={originalAudioRef}
            src={originalUrl ?? undefined}
            preload="auto"
            onEnded={() => setOriginalPlaying(false)}
            onPause={() => setOriginalPlaying(false)}
          >
            <track kind="captions" />
          </audio>
          <Waveform peaks={originalPeaks} progress={0} duration={originalDurationMs / 1000} readOnly />
          {originalLoadError ? (
            <ErrorState size="sm" title="The original couldn't be loaded" description={originalLoadError} onRetry={retryLoadOriginal} />
          ) : (
            <p className="text-xs text-fg-subtle">
              {originalUrl
                ? originalPlaying
                  ? "Playing — recording will pick up from here."
                  : "Press record to start playback and capture your take together."
                : "Loading the original…"}
            </p>
          )}
        </section>

        {phase === "ready" || phase === "recording" ? (
          <RecordStep
            recorder={recorder}
            onStart={startRecording}
            onStop={stopRecording}
            originalReady={Boolean(originalUrl) && !originalLoadError}
          />
        ) : null}

        {phase === "recorded" || phase === "publishing" || phase === "error" ? (
          recorder.state.result ? (
            <>
              <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                <h2 className="text-sm font-semibold text-fg">Your take</h2>
                {previewPeaks ? (
                  <AudioPreview blob={recorder.state.result.blob} durationMs={recorder.state.result.durationMs} peaks={previewPeaks} title="Your take" />
                ) : null}
                <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="size-4" />} onClick={retake} className="self-start">
                  Retake
                </Button>
              </section>

              <OffsetControls
                baseOffsetMs={baseOffsetMs}
                nudgeMs={nudgeMs}
                offsetMs={offsetMs}
                onNudgeChange={setNudgeMs}
              />

              <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
                <h2 className="text-sm font-semibold text-fg">Preview the mix</h2>
                <p className="text-xs text-fg-subtle">
                  Plays both tracks together with the offset applied — an approximation of the final mix. The real
                  mix is rendered server-side once you publish (spec §15).
                </p>
                <audio ref={previewOriginalRef} src={originalUrl ?? undefined}>
                  <track kind="captions" />
                </audio>
                <audio ref={previewTakeRef} src={takeUrl ?? undefined}>
                  <track kind="captions" />
                </audio>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={previewing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  onClick={previewing ? stopPreview : startPreview}
                  disabled={!originalUrl}
                  className="self-start"
                >
                  {previewing ? "Stop preview" : "Preview mix"}
                </Button>
              </section>

              <EnhancementPicker
                blob={recorder.state.result.blob}
                preset={preset}
                onPresetChange={setPreset}
                advancedEq={advancedEq}
                onAdvancedEqChange={setAdvancedEq}
              />

              <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                <label htmlFor="duet-title" className="text-[0.8125rem] font-medium text-fg">
                  Title
                </label>
                <input
                  id="duet-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
                />
              </section>

              {phase === "error" && publishError ? (
                <ErrorState title="Publishing failed" description={publishError} onRetry={handlePublish} />
              ) : null}

              <Button size="lg" loading={phase === "publishing"} onClick={handlePublish} fullWidth>
                Publish Duet
              </Button>
            </>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

function RecordStep({
  recorder,
  onStart,
  onStop,
  originalReady,
}: {
  recorder: ReturnType<typeof useRecorder>;
  onStart: () => void;
  onStop: () => void;
  /** False while the original's signed playback URL is still loading, or failed to load (spec §38). */
  originalReady: boolean;
}) {
  const { state } = recorder;
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6">
      <div className="text-2xl font-semibold tabular-nums text-fg">{formatDuration(state.elapsedMs / 1000)}</div>
      {state.status === "denied" || state.status === "unsupported" || state.status === "error" ? (
        <p className="text-sm text-danger">{state.error}</p>
      ) : null}
      {state.status === "recording" ? (
        <Button variant="danger" size="lg" leadingIcon={<Square className="size-4 fill-current" />} onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button
          size="lg"
          leadingIcon={<Mic className="size-4" />}
          onClick={onStart}
          disabled={!originalReady || state.status === "unsupported" || state.status === "requesting"}
          loading={state.status === "requesting"}
        >
          Record your contribution
        </Button>
      )}
      <p className="text-center text-xs text-fg-subtle">
        Wear headphones so your recording doesn&apos;t pick up the original playing back.
      </p>
    </section>
  );
}

function OffsetControls({
  baseOffsetMs,
  nudgeMs,
  offsetMs,
  onNudgeChange,
}: {
  baseOffsetMs: number;
  nudgeMs: number;
  offsetMs: number;
  onNudgeChange: (nudgeMs: number) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">Sync</h2>
      <p className="text-xs text-fg-subtle">
        Measured start: {(baseOffsetMs / 1000).toFixed(2)}s into the original. Nudge if it feels early or late.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNudgeChange(nudgeMs - OFFSET_NUDGE_STEP_MS)}
          aria-label={`Nudge earlier by ${OFFSET_NUDGE_STEP_MS} milliseconds`}
        >
          -{OFFSET_NUDGE_STEP_MS}ms
        </Button>
        <span className="min-w-[6rem] text-center text-sm tabular-nums text-fg" aria-live="polite">
          {offsetMs >= 0 ? "+" : ""}
          {offsetMs}ms
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNudgeChange(nudgeMs + OFFSET_NUDGE_STEP_MS)}
          aria-label={`Nudge later by ${OFFSET_NUDGE_STEP_MS} milliseconds`}
        >
          +{OFFSET_NUDGE_STEP_MS}ms
        </Button>
      </div>
    </section>
  );
}
