"use client";

/**
 * Client-only Wave creation flow (spec §17, §18, §19, §36, §38;
 * `docs/design/SCREENS.md` §4).
 *
 * Steps, in order: Record | Upload -> Review (trim, recorded takes only) ->
 * Enhance ("sounds like") -> Details -> Publish. Each step is its own
 * component (`src/components/create/*Stage.tsx`); this file only owns the
 * state that moves between them and the real publish sequence.
 *
 * `CreateWaveForm` (see `src/components/create/CreateWaveForm.tsx`) calls its
 * `onSubmit` prop with a fully assembled, fully typed `CreateWaveDraft` (see
 * `src/lib/audio/createDraft.ts`) the moment the user presses Publish.
 * `runPublish` below drives the real server sequence — ticket -> upload ->
 * finalize -> publish -> redirect (`./actions.ts`) — with a real, named stage
 * for each step (`PublishProgress`) and a retry that resumes from the top on
 * failure (spec §38, §44: no fake success, no silent failure).
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { enterChallengeAction } from "@/app/(app)/challenges/actions";
import { PageHeader } from "@/components/layout";
import {
  CreateWaveForm,
  PublishProgress,
  RecordStage,
  UploadDropzone,
  type CapturedTake,
  type PublishStage,
  type RecordStageBackingTrack,
} from "@/components/create";
import { Button, useToast } from "@/components/ui";
import {
  applyTrim,
  decodeToPeaks,
  fullRange,
  REVIEW_PEAK_BUCKETS,
  STRIP_PEAK_BUCKETS,
  type AdvancedEqSettings,
  type CreatableCreationType,
  type CreateWaveDraft,
  type EnhancementPresetId,
  type TrimRange,
} from "@/lib/audio";
import { AUDIO_BUCKET } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

import { createUploadTicket, finalizeUpload, publishWave } from "./actions";

/**
 * Neither is needed on first paint: Review (trim) and Enhance (the DSP
 * preview chain: `EnhancementPicker`, `PolishPreview`, the RNNoise worklet)
 * only render once a take exists. Loaded on demand instead of sitting in
 * `/create`'s initial bundle (CLAUDE.md: "recorder, DSP preview and
 * wavesurfer loaded only on routes that need them"; review2 #21).
 */
const ReviewStage = dynamic(() => import("@/components/create").then((mod) => mod.ReviewStage), {
  ssr: false,
});
const EnhanceStage = dynamic(() => import("@/components/create").then((mod) => mod.EnhanceStage), {
  ssr: false,
});

type Step = "capture" | "review" | "enhance" | "details";
type CaptureMode = "record" | "upload";

/** A take, however it arrived, before this flow has necessarily trimmed it. */
interface CapturedAudio {
  readonly creationType: CreatableCreationType;
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly sourceFileName: string | null;
}

/** From `?challenge=<slug>` (spec §4, `docs/CHALLENGES.md`), already resolved server-side by `page.tsx`. */
export interface CreateFlowChallenge {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly backingTrackId: string | null;
}

export interface CreateFlowProps {
  /** From `?track=<id>` (spec §4), already resolved server-side by `page.tsx`. */
  initialBackingTrack: RecordStageBackingTrack | null;
  /** From `?challenge=<slug>`; `null` when this Wave isn't entering one. */
  initialChallenge: CreateFlowChallenge | null;
}

export function CreateFlow({ initialBackingTrack, initialChallenge }: CreateFlowProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("record");
  const [backingTrack, setBackingTrack] = useState<RecordStageBackingTrack | null>(
    initialBackingTrack,
  );

  // The take exactly as captured — recorded or uploaded — before any trim.
  // Kept separately from `captured` (below) so "Re-record" on the Review
  // step has the untrimmed original to discard, not something already cut.
  const [rawTake, setRawTake] = useState<CapturedAudio | null>(null);
  const [reviewPeaks, setReviewPeaks] = useState<readonly number[] | null>(null);
  const [trimRange, setTrimRange] = useState<TrimRange | null>(null);
  const [interrupted, setInterrupted] = useState(false);

  // The take actually carried into Enhance and Details: `rawTake` after trim
  // for a recording, or `rawTake` unchanged for an upload (spec §18 does not
  // offer trim on an uploaded file — Review/trim is a recorder concept).
  const [captured, setCaptured] = useState<CapturedAudio | null>(null);
  const [enhancePeaks, setEnhancePeaks] = useState<readonly number[] | null>(null);
  const [stripPeaks, setStripPeaks] = useState<readonly number[] | null>(null);

  const [preset, setPreset] = useState<EnhancementPresetId>("natural");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);

  const [publishStage, setPublishStage] = useState<PublishStage | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CreateWaveDraft | null>(null);

  const startOver = useCallback(() => {
    setRawTake(null);
    setReviewPeaks(null);
    setTrimRange(null);
    setInterrupted(false);
    setCaptured(null);
    setEnhancePeaks(null);
    setStripPeaks(null);
    setPreset("natural");
    setAdvancedEq(null);
    setPublishStage(null);
    setPublishError(null);
    setPendingDraft(null);
    setStep("capture");
  }, []);

  const handleRecorded = useCallback((take: CapturedTake) => {
    setRawTake({
      creationType: "recorded",
      blob: take.blob,
      mimeType: take.mimeType,
      durationMs: take.durationMs,
      sourceFileName: null,
    });
    setInterrupted(take.interrupted);
    setTrimRange(fullRange(take.durationMs));
    setReviewPeaks(null);
    void decodeToPeaks(take.blob, REVIEW_PEAK_BUCKETS)
      .then(setReviewPeaks)
      .catch(() => setReviewPeaks([]));
    setStep("review");
  }, []);

  const handleUploaded = useCallback((file: File, durationMs: number) => {
    const audio: CapturedAudio = {
      creationType: "uploaded",
      blob: file,
      mimeType: file.type || "application/octet-stream",
      durationMs,
      sourceFileName: file.name,
    };
    setRawTake(audio);
    setCaptured(audio);
    setEnhancePeaks(null);
    void decodeToPeaks(file, REVIEW_PEAK_BUCKETS)
      .then(setEnhancePeaks)
      .catch(() => setEnhancePeaks([]));
    setStep("enhance");
  }, []);

  const handleReviewContinue = useCallback(() => {
    const take = rawTake;
    const range = trimRange;
    if (!take || !range) return;
    void (async () => {
      const trimmed = await applyTrim(take.blob, take.mimeType, take.durationMs, range).catch(
        () => ({ blob: take.blob, mimeType: take.mimeType, durationMs: take.durationMs }),
      );
      const next: CapturedAudio = {
        creationType: take.creationType,
        blob: trimmed.blob,
        mimeType: trimmed.mimeType,
        durationMs: trimmed.durationMs,
        sourceFileName: take.sourceFileName,
      };
      setCaptured(next);
      const peaks = await decodeToPeaks(next.blob, REVIEW_PEAK_BUCKETS).catch(() => []);
      setEnhancePeaks(peaks);
      setStep("enhance");
    })();
  }, [rawTake, trimRange]);

  const handleEnhanceContinue = useCallback(() => {
    const take = captured;
    if (!take) return;
    void decodeToPeaks(take.blob, STRIP_PEAK_BUCKETS)
      .then(setStripPeaks)
      .catch(() => setStripPeaks([]))
      .finally(() => setStep("details"));
  }, [captured]);

  const runPublish = useCallback(
    async (draft: CreateWaveDraft): Promise<void> => {
      setPendingDraft(draft);
      setPublishError(null);
      setPublishStage("uploading");

      const ticket = await createUploadTicket({
        mimeType: draft.audio.mimeType,
        sizeBytes: draft.audio.blob.size,
        durationMs: draft.audio.durationMs,
        creationType: draft.audio.creationType,
        enhancementPreset: draft.audio.enhancementPreset,
      });
      if (!ticket.ok) {
        setPublishError(ticket.error);
        return;
      }

      try {
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(AUDIO_BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.uploadToken, draft.audio.blob, {
            contentType: draft.audio.mimeType,
          });
        if (uploadError) {
          setPublishError("The upload didn't complete. Try again.");
          return;
        }
      } catch {
        setPublishError("The upload didn't complete. Check your connection and try again.");
        return;
      }

      setPublishStage("checking");
      // A "sing over a track" Wave gets a `mix_duet` job from `publishWave`
      // below, laid over the same audio asset — the ordinary `process_audio`
      // job `finalizeUpload` would otherwise enqueue must be skipped so the
      // two jobs never race the same `audio_assets` row. This is exactly the
      // race a Duet contribution stem already had to avoid (see
      // `finalizeUpload`'s doc comment and `docs/AUDIO_ARCHITECTURE.md`
      // "Duet mixdown").
      const finalized = await finalizeUpload(
        ticket.assetId,
        draft.audio.advancedEq ?? undefined,
        backingTrack !== null,
      );
      if (!finalized.ok) {
        setPublishError(finalized.error);
        return;
      }

      setPublishStage("queued");
      const published = await publishWave({
        assetId: ticket.assetId,
        title: draft.title,
        description: draft.description || null,
        creationType: draft.audio.creationType,
        visibility: draft.visibility,
        commentPermission: draft.commentPermission,
        duetPermission: draft.duetPermission,
        collaboratorUsernames: draft.collaboratorUsernames,
        categories: draft.categories,
        backingTrackId: backingTrack?.id ?? null,
      });
      if (!published.ok) {
        setPublishError(published.error);
        return;
      }

      if (initialChallenge) {
        // Best-effort: the Wave already published successfully, so a failed
        // entry (the challenge closed underneath the singer, a rate limit)
        // is surfaced as a toast, never as a reason to block navigation to
        // the Wave that did publish.
        const entered = await enterChallengeAction({
          challengeId: initialChallenge.id,
          waveId: published.waveId,
          challengeSlug: initialChallenge.slug,
        }).catch(() => null);
        if (!entered?.ok) {
          toast({
            title: `Published, but couldn't enter ${initialChallenge.title}`,
            description: entered?.formError ?? "Try entering it again from the challenge page.",
            tone: "error",
          });
        }
      }

      setPublishStage("done");
      router.push(routes.wave(published.waveId));
    },
    [backingTrack, initialChallenge, router, toast],
  );

  const handlePublish = (draft: CreateWaveDraft) => {
    void runPublish(draft);
  };

  const handleRetry = () => {
    if (pendingDraft) void runPublish(pendingDraft);
  };

  return (
    <>
      <PageHeader title={`${TERMS.create} ${TERMS.aWave}`} />

      <div className="akinti-page flex w-full max-w-xl flex-col gap-6 pb-24">
        {step === "capture" ? (
          captureMode === "record" ? (
            <RecordStage
              onCaptured={handleRecorded}
              onUpload={() => setCaptureMode("upload")}
              onChooseTrack={() => router.push(routes.tracks())}
              onClearTrack={() => {
                setBackingTrack(null);
                router.replace(routes.create());
              }}
              backingTrack={backingTrack}
            />
          ) : (
            <UploadDropzone
              onFileAccepted={handleUploaded}
              onRecord={() => setCaptureMode("record")}
            />
          )
        ) : null}

        {step === "review" && rawTake && trimRange && reviewPeaks ? (
          <ReviewStage
            blob={rawTake.blob}
            durationMs={rawTake.durationMs}
            peaks={reviewPeaks}
            range={trimRange}
            onRangeChange={setTrimRange}
            onContinue={handleReviewContinue}
            onRetake={startOver}
            interrupted={interrupted}
          />
        ) : null}

        {step === "enhance" && captured && enhancePeaks ? (
          <div className="flex flex-col gap-5">
            <EnhanceStage
              blob={captured.blob}
              peaks={enhancePeaks}
              preset={preset}
              onPresetChange={setPreset}
              advancedEq={advancedEq}
              onAdvancedEqChange={setAdvancedEq}
              onContinue={handleEnhanceContinue}
            />
            <Button variant="ghost" onClick={startOver}>
              Start over
            </Button>
          </div>
        ) : null}

        {step === "details" && captured && stripPeaks ? (
          <div className="flex flex-col gap-5">
            {publishStage !== null ? (
              <PublishProgress stage={publishStage} error={publishError} onRetry={handleRetry} />
            ) : (
              <>
                {initialChallenge ? (
                  <p className="type-caption-strong text-ink-muted">
                    Entering {initialChallenge.title}
                  </p>
                ) : null}
                <CreateWaveForm
                  audio={{
                    creationType: captured.creationType,
                    blob: captured.blob,
                    mimeType: captured.mimeType,
                    durationMs: captured.durationMs,
                    previewPeaks: stripPeaks,
                    enhancementPreset: preset,
                    advancedEq,
                    sourceFileName: captured.sourceFileName,
                  }}
                  onSubmit={handlePublish}
                  submitLabel="Publish"
                  backingTrackTitle={backingTrack?.title ?? null}
                />
                <Button variant="ghost" onClick={() => setStep("enhance")}>
                  Back
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
