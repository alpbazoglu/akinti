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

  const [phase, setPhase] = useState<Phase>("ready");
  const [baseOffsetMs, setBaseOffsetMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [previewPeaks, setPreviewPeaks] = useState<readonly number[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [preset, setPreset] = useState<EnhancementPresetId>("studio");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);
  const [title, setTitle] = useState(`Duet with @${originalCreatorUsername}`);
  const [publishError, setPublishError] = useState<string | null>(null);

  const recorder = useRecorder();

  // Resolve a signed playback URL for the original once, on mount — this
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
  }, [originalAssetId]);

  // Measure the base offset the instant the recorder actually starts
  // capturing — not at the button click, which races microphone permission
  // latency (see src/lib/duet/sync.ts's file header).
  const recordingJustStarted = recorder.state.status === "recording" && phase !== "recording";
  useEffect(() => {
    if (recordingJustStarted) {
      const elapsedMs = (originalAudioRef.current?.currentTime ?? 0) * 1000;
      setBaseOffsetMs(computeBaseOffsetMs(elapsedMs));
      setPhase("recording");
    }
  }, [recordingJustStarted]);

  useEffect(() => {
    if (recorder.state.status === "stopped" && recorder.state.result) {
      originalAudioRef.current?.pause();
      setOriginalPlaying(false);
      setPhase("recorded");
    }
  }, [recorder.state.status, recorder.state.result]);

  useEffect(() => {
    if (!recorder.state.result) {
      setPreviewPeaks(null);
      return;
    }
    let cancelled = false;
    void decodeToPeaks(recorder.state.result.blob, PREVIEW_PEAK_BUCKETS)
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
    if (!originalAudioRef.current) return;
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
    setPhase("ready");
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
    setPhase("publishing");
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
      setPhase("error");
      return;
    }

    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, result.blob, { contentType: result.mimeType });
      if (uploadError) {
        setPublishError("The upload didn't complete. Try again.");
        setPhase("error");
        return;
      }
    } catch {
      setPublishError("The upload didn't complete. Check your connection and try again.");
      setPhase("error");
      return;
    }

    const finalized = await finalizeUpload(ticket.assetId, advancedEq ?? undefined);
    if (!finalized.ok) {
      setPublishError(finalized.error);
      setPhase("error");
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
      setPhase("error");
      return;
    }

    setPhase("published");
    router.push(routes.wave(published.waveId));
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Original — &ldquo;{originalTitle}&rdquo;</h2>
          <audio ref={originalAudioRef} src={originalUrl ?? undefined} preload="auto" onEnded={() => setOriginalPlaying(false)}>
            <track kind="captions" />
          </audio>
          <Waveform peaks={originalPeaks} progress={0} duration={originalDurationMs / 1000} readOnly />
          {originalLoadError ? <p className="text-xs text-danger">{originalLoadError}</p> : null}
          <p className="text-xs text-fg-subtle">
            {originalPlaying ? "Playing — recording will pick up from here." : "Press record to start playback and capture your take together."}
          </p>
        </section>

        {phase === "ready" ? (
          <RecordStep recorder={recorder} onStart={startRecording} onStop={stopRecording} />
        ) : null}

        {phase === "recording" ? (
          <RecordStep recorder={recorder} onStart={startRecording} onStop={stopRecording} />
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
}: {
  recorder: ReturnType<typeof useRecorder>;
  onStart: () => void;
  onStop: () => void;
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
          disabled={state.status === "unsupported" || state.status === "requesting"}
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
