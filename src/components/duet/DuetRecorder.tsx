"use client";

/**
 * The Duet recorder (`docs/DUET_SPEC.md` "Duet modes"; spec items 1-2:
 * mode picker + layer/atışma/cypher capture). Built from the `create` stage
 * components (`src/components/create/*.tsx`, imported unmodified, per this
 * stage's brief) rather than the ad hoc recorder this file used to be —
 * `RecordStage` already knows how to play a reference track while capturing
 * and hand back the measured start offset (`RecordStageBackingTrack`,
 * `CapturedTake.startOffsetMs`), which is exactly what `layer` mode needs and
 * is a better-tested version of what this file used to do by hand.
 *
 * Flow: mode -> capture (mode-specific) -> review (trim, layer/cypher only —
 * an atışma take is already exact turns) -> enhance -> details (title) ->
 * publish. `publishDuetWave` (`src/app/(app)/create/duetActions.ts`) is the
 * same action for every mode; only `mode`/`segments`/`offsetMs` differ.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { Waveform } from "@/components/audio";
import {
  PublishProgress,
  type CapturedTake,
  type PublishStage,
  type RecordStageBackingTrack,
} from "@/components/create";
import { Button, ErrorState, Input } from "@/components/ui";
import {
  applyTrim,
  decodeToPeaks,
  fullRange,
  isProOnlyEnhancementPresetId,
  REVIEW_PEAK_BUCKETS,
  type AdvancedEqSettings,
  type EnhancementPresetId,
  type TrimRange,
} from "@/lib/audio";
import { markFirstPublish } from "@/lib/pwa/installPrompt";
import { AUDIO_BUCKET } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/config/routes";
import { DUET_MODE_LABEL } from "@/config/terminology";
import { cn } from "@/lib/ui";
import type { DuetMode, DuetSegment } from "@/types/domain";

import { createUploadTicket, finalizeUpload } from "@/app/(app)/create/actions";
import { publishDuetWave } from "@/app/(app)/create/duetActions";

import { DuetModePicker } from "./DuetModePicker";

/**
 * None of these render until after the mode picker's "Continue" — the
 * recorder, the trim/DSP preview chain and the atışma turn recorder are all
 * loaded on demand rather than sitting in the initial bundle of every route
 * that can reach a Duet request (CLAUDE.md: "recorder, DSP preview and
 * wavesurfer loaded only on routes that need them"; review2 #21).
 */
const RecordStage = dynamic(() => import("@/components/create").then((mod) => mod.RecordStage), {
  ssr: false,
});
const ReviewStage = dynamic(() => import("@/components/create").then((mod) => mod.ReviewStage), {
  ssr: false,
});
const EnhanceStage = dynamic(() => import("@/components/create").then((mod) => mod.EnhanceStage), {
  ssr: false,
});
const AtismaTurnRecorder = dynamic(
  () => import("./AtismaTurnRecorder").then((mod) => mod.AtismaTurnRecorder),
  { ssr: false },
);

type Stage = "mode" | "capture" | "review" | "enhance" | "details";

interface WorkingTake {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
}

export interface DuetRecorderProps {
  requestId: string;
  originalAssetId: string;
  originalTitle: string;
  originalCreatorUsername: string;
  originalPeaks: readonly number[];
  originalDurationMs: number;
  /**
   * The Cypher verse this take will occupy (2-4), or `null` when it cannot
   * be computed (e.g. the chain is already at the 4-participant cap) — see
   * `computeCypherOrder` (`src/lib/duet/chain.ts`), called by
   * `/w/[id]/duet/record/page.tsx`. Only ever read when `mode === "cypher"`.
   */
  nextCypherOrder?: number | null;
  className?: string;
}

export function DuetRecorder({
  requestId,
  originalAssetId,
  originalTitle,
  originalCreatorUsername,
  originalPeaks,
  originalDurationMs,
  nextCypherOrder = null,
  className,
}: DuetRecorderProps) {
  const t = useTranslations("DuetRecorder");
  const tTerms = useTranslations("Terms");
  const tModePicker = useTranslations("DuetModePicker");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("mode");
  const [mode, setMode] = useState<DuetMode>("layer");

  const [take, setTake] = useState<WorkingTake | null>(null);
  const [trimRange, setTrimRange] = useState<TrimRange | null>(null);
  const [reviewPeaks, setReviewPeaks] = useState<readonly number[] | null>(null);
  const [enhancePeaks, setEnhancePeaks] = useState<readonly number[] | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [segments, setSegments] = useState<DuetSegment[] | null>(null);

  const [preset, setPreset] = useState<EnhancementPresetId>("studio");
  const [advancedEq, setAdvancedEq] = useState<AdvancedEqSettings | null>(null);
  const [title, setTitle] = useState(
    t("defaultTitle", { duet: tTerms("duet"), username: originalCreatorUsername }),
  );

  const [publishStage, setPublishStage] = useState<PublishStage | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const backingTrack: RecordStageBackingTrack = useMemo(
    () => ({
      id: requestId,
      title: originalTitle,
      artistCredit: `@${originalCreatorUsername}`,
      audioAssetId: originalAssetId,
      durationMs: originalDurationMs || null,
    }),
    [requestId, originalTitle, originalCreatorUsername, originalAssetId, originalDurationMs],
  );

  const resetCapture = () => {
    setTake(null);
    setTrimRange(null);
    setReviewPeaks(null);
    setEnhancePeaks(null);
    setSegments(null);
    setOffsetMs(0);
    setPublishStage(null);
    setPublishError(null);
  };

  const handleModeContinue = () => {
    resetCapture();
    setStage("capture");
  };

  const handleLayerOrCypherCaptured = (captured: CapturedTake, resolvedOffsetMs: number) => {
    setTake({ blob: captured.blob, mimeType: captured.mimeType, durationMs: captured.durationMs });
    setOffsetMs(resolvedOffsetMs);
    setTrimRange(fullRange(captured.durationMs));
    setReviewPeaks(null);
    void decodeToPeaks(captured.blob, REVIEW_PEAK_BUCKETS)
      .then(setReviewPeaks)
      .catch(() => setReviewPeaks([]));
    setStage("review");
  };

  const handleAtismaComplete = (result: { blob: Blob; durationMs: number; segments: DuetSegment[] }) => {
    setTake({ blob: result.blob, mimeType: "audio/wav", durationMs: result.durationMs });
    setSegments(result.segments);
    setOffsetMs(0);
    setEnhancePeaks(null);
    void decodeToPeaks(result.blob, REVIEW_PEAK_BUCKETS)
      .then(setEnhancePeaks)
      .catch(() => setEnhancePeaks([]));
    // An atışma take is already an exact sequence of turns — trimming it would
    // desynchronize it from the `segments` array, so it skips straight to Enhance.
    setStage("enhance");
  };

  const handleReviewContinue = () => {
    if (!take || !trimRange) return;
    void applyTrim(take.blob, take.mimeType, take.durationMs, trimRange)
      .catch(() => ({ blob: take.blob, mimeType: take.mimeType, durationMs: take.durationMs }))
      .then((trimmed) => {
        // Trimming the front of the contribution shifts its content later
        // relative to the original by exactly the amount cut.
        setOffsetMs((current) => current + trimRange.startMs);
        setTake({ blob: trimmed.blob, mimeType: trimmed.mimeType, durationMs: trimmed.durationMs });
        return decodeToPeaks(trimmed.blob, REVIEW_PEAK_BUCKETS).catch(() => []);
      })
      .then((peaks) => {
        setEnhancePeaks(peaks);
        setStage("enhance");
      });
  };

  const handleEnhanceContinue = () => setStage("details");

  const runPublish = async () => {
    if (!take) return;
    setPublishError(null);
    setPublishStage("uploading");

    const ticket = await createUploadTicket({
      mimeType: take.mimeType,
      sizeBytes: take.blob.size,
      durationMs: take.durationMs,
      creationType: "recorded",
      enhancementPreset: preset,
    });
    if (!ticket.ok) {
      setPublishError(ticket.error);
      return;
    }

    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, take.blob, { contentType: take.mimeType });
      if (uploadError) {
        setPublishError(t("uploadIncompleteError"));
        return;
      }
    } catch {
      setPublishError(t("uploadIncompleteConnectionError"));
      return;
    }

    setPublishStage("checking");
    // `skipAutoProcessing: true` — the `mix_duet` job below applies `preset`/
    // `advancedEq` as part of the mixdown (see `create/duetActions.ts`'s file
    // header on the job race this avoids).
    const finalized = await finalizeUpload(ticket.assetId, advancedEq ?? undefined, true);
    if (!finalized.ok) {
      setPublishError(finalized.error);
      return;
    }

    setPublishStage("queued");
    const published = await publishDuetWave({
      requestId,
      contributionAssetId: ticket.assetId,
      offsetMs,
      title:
        title.trim() ||
        t("defaultTitle", { duet: tTerms("duet"), username: originalCreatorUsername }),
      visibility: "everyone",
      preset,
      advancedEq,
      mode,
      segments: mode === "atisma" ? segments : null,
    });
    if (!published.ok) {
      setPublishError(published.error);
      return;
    }

    setPublishStage("done");
    markFirstPublish();
    router.push(routes.wave(published.waveId));
  };

  const handlePublish = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runPublish();
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <p className="type-caption-strong text-ink-muted">{t("theOriginal", { title: originalTitle })}</p>
          <div className="-mx-page">
            <Waveform
              peaks={originalPeaks}
              progress={0}
              duration={originalDurationMs / 1000}
              readOnly
              fullBleed
              label={t("theOriginalWave")}
            />
          </div>
        </section>

        {stage === "mode" ? (
          <section className="flex flex-col gap-6">
            <DuetModePicker value={mode} onChange={setMode} />
            <Button size="lg" onClick={handleModeContinue}>
              {t("continue")}
            </Button>
          </section>
        ) : null}

        {stage === "capture" ? (
          <section className="flex flex-col gap-4">
            <Button variant="ghost" size="sm" onClick={() => setStage("mode")} className="self-start">
              {t("changeDuetMode")}
            </Button>

            {mode === "layer" ? (
              <>
                <p className="type-body-sm measure text-ink-muted">{tModePicker("descriptionLayer")}</p>
                <RecordStage
                  onCaptured={(captured) => handleLayerOrCypherCaptured(captured, captured.startOffsetMs)}
                  onUpload={() => {}}
                  onChooseTrack={() => {}}
                  onClearTrack={() => {}}
                  backingTrack={backingTrack}
                  hideUpload
                  hideChooseTrack
                />
              </>
            ) : mode === "cypher" ? (
              <>
                <p className="type-body-sm measure text-ink-muted">{t("cypherInstructions")}</p>
                <CypherOrderMarks
                  order={nextCypherOrder}
                  label={t("verseOrder")}
                  sentence={nextCypherOrder ? t("yourVerse", { order: nextCypherOrder, max: 4 }) : null}
                />
                <RecordStage
                  onCaptured={(captured) => handleLayerOrCypherCaptured(captured, 0)}
                  onUpload={() => {}}
                  onChooseTrack={() => {}}
                  onClearTrack={() => {}}
                  backingTrack={null}
                  hideUpload
                  hideChooseTrack
                />
              </>
            ) : (
              <AtismaTurnRecorder
                originalAssetId={originalAssetId}
                originalTitle={originalTitle}
                originalPeaks={originalPeaks}
                originalDurationMs={originalDurationMs}
                onComplete={handleAtismaComplete}
              />
            )}
          </section>
        ) : null}

        {stage === "review" && take && trimRange && reviewPeaks ? (
          <ReviewStage
            blob={take.blob}
            durationMs={take.durationMs}
            peaks={reviewPeaks}
            range={trimRange}
            onRangeChange={setTrimRange}
            onContinue={handleReviewContinue}
            onRetake={() => setStage("capture")}
          />
        ) : null}

        {stage === "enhance" && take && enhancePeaks ? (
          <EnhanceStage
            blob={take.blob}
            peaks={enhancePeaks}
            preset={preset}
            // The mix_duet worker path (unlike process_audio) does not yet
            // route pitch_snap/self_harmony through the sidecar's dedicated
            // endpoints — see docs/AUDIO_ARCHITECTURE.md "Pitch score" and
            // scripts/worker.ts's runMixDuetJob. Ignore a Pro selection here
            // rather than silently applying just the EQ/compressor chain
            // PRESET_FILTERS carries for these ids, which would be a fake
            // "pitch snap"/"self harmony" for a Duet take.
            onPresetChange={(next) => {
              if (!isProOnlyEnhancementPresetId(next)) setPreset(next);
            }}
            advancedEq={advancedEq}
            onAdvancedEqChange={setAdvancedEq}
            onContinue={handleEnhanceContinue}
          />
        ) : null}

        {stage === "details" && take ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
              <div className="flex min-w-0 flex-1 flex-col gap-5">
                {publishStage === null ? (
                  <form onSubmit={handlePublish} className="flex flex-col gap-5" noValidate>
                    <Input
                      id="duet-title"
                      label={t("titleLabel")}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={120}
                      required
                    />
                    {publishError ? (
                      <ErrorState size="sm" title={t("publishingFailed")} description={publishError} />
                    ) : null}
                    <Button type="submit" size="lg" fullWidth>
                      {t("publishDuet", { duet: tTerms("duet") })}
                    </Button>
                  </form>
                ) : null}
              </div>

              {/* Right column (desktop only, mobile is unaffected below):
                  a recap of the mode this take was made in, since Details is
                  reached well after the mode picker scrolled out of view. */}
              <aside className="hidden flex-col gap-4 lg:flex lg:w-[300px] lg:shrink-0">
                <RecapPanel
                  mode={mode}
                  nextCypherOrder={nextCypherOrder}
                  description={tModePicker(MODE_DESCRIPTION_KEY[mode])}
                  modeLabel={DUET_MODE_LABEL[mode]}
                  verseOrderLabel={t("verseOrder")}
                  verseSentence={mode === "cypher" && nextCypherOrder ? t("yourVerse", { order: nextCypherOrder, max: 4 }) : null}
                  heading={t("aboutThisDuet", { duet: tTerms("duet") })}
                />
              </aside>
            </div>

            {publishStage !== null ? (
              <PublishProgress stage={publishStage} error={publishError} onRetry={() => void runPublish()} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Parallel to `DuetModePicker`'s own private map — same three keys, translated. */
const MODE_DESCRIPTION_KEY = {
  layer: "descriptionLayer",
  atisma: "descriptionAtisma",
  cypher: "descriptionCypher",
} as const satisfies Record<DuetMode, string>;

/** One class string per verse, so Tailwind sees a literal utility class rather than an interpolated one it cannot statically find. */
const CYPHER_HUE_CLASSES = [
  "border-hue-cypher-1 bg-hue-cypher-1",
  "border-hue-cypher-2 bg-hue-cypher-2",
  "border-hue-cypher-3 bg-hue-cypher-3",
  "border-hue-cypher-4 bg-hue-cypher-4",
] as const;

/**
 * The Cypher verse order (this pass's brief, item 1: "verse order for Cypher
 * with the four hue marks") — four dots in the fixed hue sequence
 * `docs/design/COLOR_V2.md` already assigns per verse (teal, reed green,
 * sand, deep-water blue). Filled up to and including this take's own verse;
 * the current one carries a focus-style ring so it reads as "you are here",
 * not just "taken". Renders nothing when `order` is `null` (the cap was hit
 * or the computation failed) rather than drawing a guess.
 */
function CypherOrderMarks({
  order,
  label,
  sentence,
}: {
  order: number | null;
  label: string;
  sentence: string | null;
}) {
  if (!order) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="type-caption-strong text-ink-muted">{label}</p>
      <div className="flex items-center gap-2">
        {CYPHER_HUE_CLASSES.map((hueClass, index) => {
          const position = index + 1;
          const filled = position <= order;
          const isYours = position === order;
          return (
            <span
              key={hueClass}
              aria-hidden="true"
              className={cn(
                "size-3 rounded-full border-2",
                filled ? hueClass : "border-hairline-strong bg-transparent",
                isYours && "ring-2 ring-tide ring-offset-2 ring-offset-paper",
              )}
            />
          );
        })}
      </div>
      {sentence ? <p className="type-caption text-ink-subtle">{sentence}</p> : null}
    </div>
  );
}

/** The Details step's right column: which mode this take was made in, and why it sounds the way it does. */
function RecapPanel({
  mode,
  nextCypherOrder,
  description,
  modeLabel,
  heading,
  verseOrderLabel,
  verseSentence,
}: {
  mode: DuetMode;
  nextCypherOrder: number | null;
  description: string;
  modeLabel: string;
  heading: string;
  verseOrderLabel: string;
  verseSentence: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-object border border-hairline p-4">
      <div className="flex flex-col gap-1">
        <p className="type-caption-strong text-ink-muted">{heading}</p>
        <p className="type-subhead text-ink">{modeLabel}</p>
        <p className="type-body-sm text-ink-muted">{description}</p>
      </div>
      {mode === "cypher" ? (
        <CypherOrderMarks order={nextCypherOrder} label={verseOrderLabel} sentence={verseSentence} />
      ) : null}
    </div>
  );
}
