"use client";

/**
 * Client-only Wave creation flow (spec §17, §18, §19, §36, §38).
 *
 * Steps: Record | Upload -> preview -> enhance -> details -> Publish.
 *
 * `CreateWaveForm` (see `src/components/create/CreateWaveForm.tsx`) calls
 * its `onSubmit` prop with a fully assembled, fully typed `CreateWaveDraft`
 * (see `src/lib/audio/createDraft.ts`) the moment the user presses Publish.
 * `runPublish` below drives the real server sequence — ticket -> upload ->
 * finalize -> publish -> redirect (`./actions.ts`) — with a real phase for
 * each step and a retry that resumes from the top on failure (spec §38,
 * §44: no fake success, no silent failure).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Upload as UploadIcon } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { AudioPreview, EnhancementPicker, RecorderPanel } from "@/components/audio";
import { CreateWaveForm, UploadDropzone } from "@/components/create";
import { Button, ErrorState, TabPanel, Tabs, tabId, tabPanelId } from "@/components/ui";
import {
  decodeToPeaks,
  type AdvancedEqSettings,
  type CreatableCreationType,
  type EnhancementPresetId,
  type RecorderResult,
} from "@/lib/audio";
import { AUDIO_BUCKET } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import type { CreateWaveDraft } from "@/lib/audio/createDraft";

import { createUploadTicket, finalizeUpload, publishWave } from "./actions";

const PREVIEW_PEAK_BUCKETS = 72;
const TAB_ID_PREFIX = "create-capture";

type Step = "capture" | "enhance" | "details";
type CaptureMode = "record" | "upload";

interface CapturedAudio {
  readonly creationType: CreatableCreationType;
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly sourceFileName: string | null;
}

type PublishPhase = "idle" | "uploading" | "finalizing" | "publishing" | "error";

const PHASE_LABEL: Record<Exclude<PublishPhase, "idle" | "error">, string> = {
  uploading: "Uploading your Wave…",
  finalizing: "Verifying your upload…",
  publishing: "Publishing…",
};

export function CreateFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("record");
  const [captured, setCaptured] = useState<CapturedAudio | null>(null);
  const [previewPeaks, setPreviewPeaks] = useState<readonly number[] | null>(null);
  const [preset, setPreset] = useState<EnhancementPresetId>("natural");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CreateWaveDraft | null>(null);

  useEffect(() => {
    // Resetting to null on every new `captured` happens in the setters below
    // (`handleRecorded`/`handleUploaded`/`startOver`), not here — this effect
    // only kicks off the async decode and reports its result.
    if (!captured) return;
    let cancelled = false;
    void decodeToPeaks(captured.blob, PREVIEW_PEAK_BUCKETS)
      .then((peaks) => {
        if (!cancelled) setPreviewPeaks(peaks);
      })
      .catch(() => {
        // Preview-only: if decoding fails (unusual format, etc.) fall back to
        // flat placeholder peaks rather than blocking the flow. The server
        // regenerates real peaks from the processed file regardless.
        if (!cancelled) setPreviewPeaks(new Array(PREVIEW_PEAK_BUCKETS).fill(0.2));
      });
    return () => {
      cancelled = true;
    };
  }, [captured]);

  const handleRecorded = (result: RecorderResult) => {
    setPreviewPeaks(null);
    setCaptured({
      creationType: "recorded",
      blob: result.blob,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      sourceFileName: null,
    });
    setStep("enhance");
  };

  const handleUploaded = (file: File, durationMs: number) => {
    setPreviewPeaks(null);
    setCaptured({
      creationType: "uploaded",
      blob: file,
      mimeType: file.type || "application/octet-stream",
      durationMs,
      sourceFileName: file.name,
    });
    setStep("enhance");
  };

  const startOver = () => {
    setCaptured(null);
    setPreviewPeaks(null);
    setPreset("natural");
    setAdvancedEq(null);
    setPublishPhase("idle");
    setPublishError(null);
    setPendingDraft(null);
    setStep("capture");
  };

  const runPublish = async (draft: CreateWaveDraft): Promise<void> => {
    setPendingDraft(draft);
    setPublishError(null);
    setPublishPhase("uploading");

    const ticket = await createUploadTicket({
      mimeType: draft.audio.mimeType,
      sizeBytes: draft.audio.blob.size,
      durationMs: draft.audio.durationMs,
      creationType: draft.audio.creationType,
      enhancementPreset: draft.audio.enhancementPreset,
    });
    if (!ticket.ok) {
      setPublishError(ticket.error);
      setPublishPhase("error");
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
        setPublishPhase("error");
        return;
      }
    } catch {
      setPublishError("The upload didn't complete. Check your connection and try again.");
      setPublishPhase("error");
      return;
    }

    setPublishPhase("finalizing");
    const finalized = await finalizeUpload(ticket.assetId, draft.audio.advancedEq ?? undefined);
    if (!finalized.ok) {
      setPublishError(finalized.error);
      setPublishPhase("error");
      return;
    }

    setPublishPhase("publishing");
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
    });
    if (!published.ok) {
      setPublishError(published.error);
      setPublishPhase("error");
      return;
    }

    router.push(routes.wave(published.waveId));
  };

  const handlePublish = (draft: CreateWaveDraft) => {
    void runPublish(draft);
  };

  const handleRetry = () => {
    if (pendingDraft) void runPublish(pendingDraft);
  };

  const isSubmitting = publishPhase !== "idle" && publishPhase !== "error";

  return (
    <>
      <PageHeader
        title={`${TERMS.create} ${TERMS.aWave}`}
        description={`${TERMS.record} straight into ${TERMS.brand}, or ${TERMS.upload.toLowerCase()} audio you already have.`}
      />

      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-24 sm:px-5">
        {step === "capture" ? (
          <div className="flex flex-col gap-4">
            <Tabs
              items={[
                { value: "record", label: TERMS.record, icon: <Mic className="size-4" /> },
                { value: "upload", label: TERMS.upload, icon: <UploadIcon className="size-4" /> },
              ]}
              value={captureMode}
              onValueChange={(value) => setCaptureMode(value as CaptureMode)}
              label="Choose how to add audio"
              variant="segmented"
              idPrefix={TAB_ID_PREFIX}
              className="self-start"
            />
            <TabPanel
              id={tabPanelId(TAB_ID_PREFIX, "record")}
              labelledBy={tabId(TAB_ID_PREFIX, "record")}
              active={captureMode === "record"}
            >
              <RecorderPanel onComplete={handleRecorded} />
            </TabPanel>
            <TabPanel
              id={tabPanelId(TAB_ID_PREFIX, "upload")}
              labelledBy={tabId(TAB_ID_PREFIX, "upload")}
              active={captureMode === "upload"}
            >
              <UploadDropzone onFileAccepted={handleUploaded} />
            </TabPanel>
          </div>
        ) : null}

        {step === "enhance" && captured ? (
          <div className="flex flex-col gap-5">
            {previewPeaks ? (
              <AudioPreview
                blob={captured.blob}
                durationMs={captured.durationMs}
                peaks={previewPeaks}
                title="Your take"
              />
            ) : null}
            <EnhancementPicker
              blob={captured.blob}
              preset={preset}
              onPresetChange={setPreset}
              advancedEq={advancedEq}
              onAdvancedEqChange={setAdvancedEq}
            />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={startOver}>
                Start over
              </Button>
              <Button onClick={() => setStep("details")}>Continue</Button>
            </div>
          </div>
        ) : null}

        {step === "details" && captured && previewPeaks ? (
          <div className="flex flex-col gap-5">
            <CreateWaveForm
              audio={{
                creationType: captured.creationType,
                blob: captured.blob,
                mimeType: captured.mimeType,
                durationMs: captured.durationMs,
                previewPeaks,
                enhancementPreset: preset,
                advancedEq,
                sourceFileName: captured.sourceFileName,
              }}
              onSubmit={handlePublish}
              submitting={isSubmitting}
              submitLabel="Publish"
            />
            <Button variant="ghost" onClick={() => setStep("enhance")} disabled={isSubmitting}>
              Back
            </Button>

            {isSubmitting ? (
              <p aria-live="polite" className="text-center text-sm text-fg-muted">
                {PHASE_LABEL[publishPhase as Exclude<PublishPhase, "idle" | "error">]}
              </p>
            ) : null}

            {publishPhase === "error" && publishError ? (
              <ErrorState
                title="Publishing failed"
                description={publishError}
                onRetry={handleRetry}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
