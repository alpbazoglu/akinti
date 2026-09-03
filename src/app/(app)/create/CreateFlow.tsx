"use client";

/**
 * Client-only Wave creation flow (spec §17, §18, §19, §36, §38).
 *
 * Steps: Record | Upload -> preview -> enhance -> details -> Publish.
 *
 * HAND-OFF CONTRACT for the server-side agent: `CreateWaveForm` (see
 * `src/components/create/CreateWaveForm.tsx`) calls its `onSubmit` prop with
 * a fully assembled, fully typed `CreateWaveDraft` (see
 * `src/lib/audio/createDraft.ts`) the moment the user presses Publish.
 * `handlePublish` below is the ONLY seam that needs to change: upload
 * `draft.audio.blob` to the private `audio` bucket, create the
 * `audio_assets` + `waves` rows, and `enqueue_audio_job()` passing
 * `draft.audio.enhancementPreset` (and `draft.audio.advancedEq`, if that
 * should ride along as job payload). Nothing else in this file, or in any
 * component it renders, makes a server action or Supabase call — until the
 * seam is wired, Publish surfaces an honest inline notice instead of a fake
 * success state (spec §38, §44: never pretend a feature works when it only
 * mocked).
 */

import { useEffect, useState } from "react";
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
import { TERMS } from "@/config/terminology";

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

export function CreateFlow() {
  const [step, setStep] = useState<Step>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("record");
  const [captured, setCaptured] = useState<CapturedAudio | null>(null);
  const [previewPeaks, setPreviewPeaks] = useState<readonly number[] | null>(null);
  const [preset, setPreset] = useState<EnhancementPresetId>("natural");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);
  const [publishNotice, setPublishNotice] = useState(false);

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
    setPublishNotice(false);
    setStep("capture");
  };

  const handlePublish = () => {
    // See the file header: this is where publishing gets wired up. Until
    // then, tell the truth instead of faking success (spec §38, §44).
    setPublishNotice(true);
  };

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
              submitLabel="Publish"
            />
            <Button variant="ghost" onClick={() => setStep("enhance")}>
              Back
            </Button>

            {publishNotice ? (
              <ErrorState
                title="Publishing is not connected yet"
                description="Recording, upload and enhancement all work locally, but this build does not send your Wave to the server yet. That step lands with the server-side audio integration."
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
