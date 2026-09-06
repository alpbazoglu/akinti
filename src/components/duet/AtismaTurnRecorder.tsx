"use client";

/**
 * Atışma (call-and-response) capture (`docs/DUET_SPEC.md` "Duet modes",
 * spec item 2: "alternating segments with the original's segments shown on
 * the trace, record your reply segments").
 *
 * The original is split into `turnCount` equal turns. For each turn: play
 * that slice of the original, then capture one reply take with `RecordStage`
 * (`src/components/create/RecordStage.tsx`, imported unmodified and
 * remounted per turn via `key`, so every turn gets its own fresh recorder —
 * monitoring, countdown, level meter, all included for free). Once every
 * turn has a reply, the takes are concatenated (`./atismaAudio.ts`) into one
 * take and handed to the parent as a `DuetSegment[]` ready for
 * `publishDuetWave`.
 *
 * `RecordStage`'s `hideUpload`/`hideChooseTrack` props hide "Upload a file
 * instead" and "Sing over a track" entirely — neither applies to a Duet turn
 * (a Duet is always recorded live, against a fixed original).
 *
 * The original plays through the single global playback store, the same as
 * every other Wave in this product (CLAUDE.md: "exactly one global playback
 * store and one `<audio>`") rather than a raw `<audio>` element of its own —
 * a synthetic `atisma-original:<assetId>` id keeps it out of `PersistentPlayer`
 * (which already excludes `backing-track:` ids the same way) while still
 * routing through the one media element everything else shares.
 */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Waveform } from "@/components/audio";
import { RecordStage, type CapturedTake } from "@/components/create";
import { useStageShortcuts } from "@/components/create/useStageShortcuts";
import { Button, ErrorState } from "@/components/ui";
import { Check, Pause, Play } from "@/components/ui/icons";
import { usePlaybackStore, useWaveControls, useWavePlayback } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";
import type { DuetSegment } from "@/types/domain";

import { concatenateAtismaTurns, type AtismaTurnTake } from "./atismaAudio";

const MIN_TURNS = 2;
const MAX_TURNS = 8;
const DEFAULT_TURNS = 4;

type Phase = "setup" | "listening" | "recording" | "assembling" | "error";

export interface AtismaTurnRecorderProps {
  originalAssetId: string;
  originalTitle: string;
  originalPeaks: readonly number[];
  originalDurationMs: number;
  onComplete: (result: { blob: Blob; durationMs: number; segments: DuetSegment[] }) => void;
  className?: string;
}

export function AtismaTurnRecorder({
  originalAssetId,
  originalTitle,
  originalPeaks,
  originalDurationMs,
  onComplete,
  className,
}: AtismaTurnRecorderProps) {
  const t = useTranslations("AtismaTurnRecorder");
  const tModePicker = useTranslations("DuetModePicker");
  const tRecordStage = useTranslations("RecordStage");
  const store = usePlaybackStore();
  const waveId = useMemo(() => `atisma-original:${originalAssetId}`, [originalAssetId]);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [originalLoadError, setOriginalLoadError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(DEFAULT_TURNS);
  const [phase, setPhase] = useState<Phase>("setup");
  const [turnIndex, setTurnIndex] = useState(0);
  const [takes, setTakes] = useState<AtismaTurnTake[]>([]);
  const [assembleError, setAssembleError] = useState<string | null>(null);

  const { toggle } = useWaveControls(waveId, originalUrl ?? "", {
    title: originalTitle,
    duration: originalDurationMs / 1000,
    assetId: originalAssetId,
  });
  const playback = useWavePlayback(waveId, originalDurationMs / 1000);

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
        if (!cancelled) setOriginalLoadError(t("originalLoadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [originalAssetId, t]);

  // Leave the original paused when this recorder unmounts (a turn change,
  // navigating away) rather than letting it keep playing out of the store.
  useEffect(() => {
    return () => {
      if (store.getState().waveId === waveId) store.pause();
    };
  }, [store, waveId]);

  const boundaries = useMemo(() => {
    const marks: number[] = [];
    for (let i = 0; i <= turnCount; i += 1) {
      marks.push(Math.round((i * originalDurationMs) / turnCount));
    }
    return marks;
  }, [turnCount, originalDurationMs]);

  const turnStartMs = boundaries[turnIndex] ?? 0;
  const turnEndMs = boundaries[turnIndex + 1] ?? originalDurationMs;

  const slicePeaks = useMemo(() => {
    if (originalPeaks.length === 0 || originalDurationMs <= 0) return originalPeaks;
    const startIdx = Math.floor((turnStartMs / originalDurationMs) * originalPeaks.length);
    const endIdx = Math.max(startIdx + 1, Math.ceil((turnEndMs / originalDurationMs) * originalPeaks.length));
    return originalPeaks.slice(startIdx, endIdx);
  }, [originalPeaks, originalDurationMs, turnStartMs, turnEndMs]);

  const beginTurns = () => {
    setTurnIndex(0);
    setTakes([]);
    setPhase("listening");
  };

  const playTurn = () => {
    if (!originalUrl) return;
    // Seek to this turn's start before/while (re)starting playback of the
    // same Wave — the store's own segment-range convention (RecordStage's
    // backing-track transport does the same `play` + `seek` pairing).
    store.play(waveId, originalUrl, {
      title: originalTitle,
      duration: originalDurationMs / 1000,
      assetId: originalAssetId,
    });
    store.seek(turnStartMs / 1000);
  };

  useEffect(() => {
    if (phase === "listening") playTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per turn transition, not on every originalUrl/turnStartMs re-render
  }, [phase, turnIndex]);

  // Segment-range playback: stop exactly at this turn's end, the same
  // boundary the raw `<audio onTimeUpdate>` handler used to enforce.
  useEffect(() => {
    if (phase !== "listening" || !playback.isActive) return;
    if (playback.currentTime * 1000 >= turnEndMs) {
      store.pause();
    }
  }, [phase, playback.isActive, playback.currentTime, turnEndMs, store]);

  // "Skip ahead and record my reply" and entering the recording phase must
  // never leave the original audible into the mic (review2 #4).
  useEffect(() => {
    if (phase === "recording" && store.getState().waveId === waveId) store.pause();
  }, [phase, store, waveId]);

  const handleCaptured = (take: CapturedTake) => {
    const nextTakes = [...takes, { blob: take.blob, durationMs: take.durationMs }];
    setTakes(nextTakes);
    if (turnIndex + 1 < turnCount) {
      setTurnIndex((n) => n + 1);
      setPhase("listening");
      return;
    }
    setPhase("assembling");
    void concatenateAtismaTurns(nextTakes)
      .then((concatenated) => {
        const segments: DuetSegment[] = [];
        for (let i = 0; i < turnCount; i += 1) {
          segments.push({ source: "original", startMs: boundaries[i]!, endMs: boundaries[i + 1]! });
          const range = concatenated.ranges[i]!;
          segments.push({ source: "contribution", startMs: range.startMs, endMs: range.endMs });
        }
        onComplete({ blob: concatenated.blob, durationMs: concatenated.durationMs, segments });
      })
      .catch(() => {
        setAssembleError(t("assembleError"));
        setPhase("error");
      });
  };

  const skipToRecording = () => {
    if (store.getState().waveId === waveId) store.pause();
    setPhase("recording");
  };

  // "space = play/pause their turn" while listening — the desktop two-column
  // layout's left stage has no other transport to compete with here (unlike
  // `RecordStage`, which already owns space for arm/stop once mounted below,
  // so this is deliberately `undefined` outside the listening phase rather
  // than double-handling the key).
  useStageShortcuts({ onSpace: phase === "listening" ? toggle : undefined });

  if (originalLoadError) {
    return <ErrorState title={t("originalCouldNotBeLoaded")} description={originalLoadError} className={className} />;
  }

  if (phase === "setup") {
    return (
      <section className={cn("flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="type-subhead text-ink">{t("howManyExchanges")}</p>
            <p className="type-body-sm measure text-ink-muted">
              {t("turnsSplitDescription", { title: originalTitle })}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTurnCount((n) => Math.max(MIN_TURNS, n - 1))}
              disabled={turnCount <= MIN_TURNS}
              aria-label={t("fewerTurns")}
            >
              −
            </Button>
            <span className="type-mono-lg min-w-[2ch] text-center text-ink">{turnCount}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTurnCount((n) => Math.min(MAX_TURNS, n + 1))}
              disabled={turnCount >= MAX_TURNS}
              aria-label={t("moreTurns")}
            >
              +
            </Button>
          </div>
          <Button size="lg" onClick={beginTurns} disabled={!originalUrl}>
            {originalUrl ? t("startFirstTurn") : t("loadingOriginal")}
          </Button>
        </div>

        {/* Right column (desktop only, this pass's brief, item 1): a preview
            of the turns this count will produce, and what Atışma is, since
            the mode picker's own one-line explanation has already scrolled
            out of view by the time the reader is here. */}
        <aside className="hidden flex-col gap-5 lg:flex lg:w-[280px] lg:shrink-0">
          <TurnList turnCount={turnCount} completedCount={0} currentIndex={-1} t={t} />
          <ModeAndHint description={tModePicker("descriptionAtisma")} hint={tRecordStage("bestWithHeadphones")} />
        </aside>
      </section>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        title={t("couldNotFinish")}
        description={assembleError ?? t("somethingWentWrong")}
        onRetry={beginTurns}
        className={className}
      />
    );
  }

  if (phase === "assembling") {
    return (
      <section className={className}>
        <p className="type-body-sm text-ink-muted">{t("puttingTogether")}</p>
      </section>
    );
  }

  const trim =
    originalDurationMs > 0
      ? { start: turnStartMs / originalDurationMs, end: turnEndMs / originalDurationMs }
      : undefined;

  return (
    <section className={cn("flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <p className="type-caption-strong text-ink-muted">
            {t("turnOf", { current: turnIndex + 1, total: turnCount })}
          </p>
          <p className="type-mono-sm text-ink-subtle">
            {formatDuration(turnStartMs / 1000)}–{formatDuration(turnEndMs / 1000)}
          </p>
        </div>

        {/* Mobile: this turn's own slice, unchanged. */}
        <div className="-mx-page lg:hidden">
          <Waveform peaks={slicePeaks} progress={0} duration={(turnEndMs - turnStartMs) / 1000} readOnly fullBleed />
        </div>

        {/* Desktop ("original trace with segments", this pass's brief, item
            1): the whole original, with this turn's window carved out via
            `Waveform`'s existing trim highlight rather than a second trace
            style invented for this screen. */}
        <div className="hidden lg:block">
          <Waveform
            peaks={originalPeaks}
            progress={0}
            duration={originalDurationMs / 1000}
            trim={trim}
            readOnly
            label={t("turnOf", { current: turnIndex + 1, total: turnCount })}
          />
        </div>

        {phase === "listening" ? (
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="secondary"
              size="lg"
              leadingIcon={playback.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              onClick={toggle}
            >
              {playback.isPlaying ? t("playingTheirTurn") : t("playTheirTurn")}
            </Button>
            <Button variant="ghost" onClick={skipToRecording}>
              {t("skipAheadAndRecord")}
            </Button>
          </div>
        ) : (
          <>
            {/* A slim progress row instead of a second right column here —
                `RecordStage` below already draws its own desktop two-column
                split (trace/transport left, monitoring/headphones settings
                right, per `DESIGN_V3_DESKTOP.md`), so a second full rail
                next to it would only crowd it. The full turn list lives in
                the listening phase's right column instead. */}
            <div className="hidden items-center gap-1.5 lg:flex" aria-hidden="true">
              {Array.from({ length: turnCount }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    index < takes.length ? "bg-atisma" : index === turnIndex ? "bg-tide" : "bg-hairline-strong",
                  )}
                />
              ))}
            </div>
            <RecordStage
              key={`turn-${turnIndex}`}
              onCaptured={handleCaptured}
              onUpload={() => {}}
              onChooseTrack={() => {}}
              onClearTrack={() => {}}
              backingTrack={null}
              hideUpload
              hideChooseTrack
            />
          </>
        )}
      </div>

      {/* Right column, listening only (desktop) — see the note above for why
          "recording" does not also get one. */}
      {phase === "listening" ? (
        <aside className="hidden flex-col gap-5 lg:flex lg:w-[280px] lg:shrink-0">
          <TurnList turnCount={turnCount} completedCount={takes.length} currentIndex={turnIndex} t={t} />
          <ModeAndHint description={tModePicker("descriptionAtisma")} hint={tRecordStage("bestWithHeadphones")} />
        </aside>
      ) : null}
    </section>
  );
}

/** The turn list (this pass's brief, item 1): who sings when, with reed-green marks for turns already replied to. */
function TurnList({
  turnCount,
  completedCount,
  currentIndex,
  t,
}: {
  turnCount: number;
  completedCount: number;
  currentIndex: number;
  t: ReturnType<typeof useTranslations<"AtismaTurnRecorder">>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="type-caption-strong text-ink-muted">{t("turnList")}</p>
      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {Array.from({ length: turnCount }).map((_, index) => {
          const status: "done" | "current" | "upcoming" =
            index < completedCount ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={index} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  status === "done"
                    ? "border-atisma bg-atisma text-on-ink"
                    : status === "current"
                      ? "border-tide text-tide"
                      : "border-hairline-strong text-ink-subtle",
                )}
              >
                {status === "done" ? (
                  <Check className="size-3" weight="bold" />
                ) : (
                  <span className="type-mono-sm">{index + 1}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="type-body-sm text-ink">{t("turnOf", { current: index + 1, total: turnCount })}</span>
                <span className="type-caption text-ink-subtle">
                  {status === "done" ? t("repliedLabel") : status === "current" ? t("upNowLabel") : t("notYetLabel")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One-sentence mode explanation + the headphone tip, reused verbatim from `DuetModePicker`/`RecordStage` rather than forked into new copy. */
function ModeAndHint({ description, hint }: { description: string; hint: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <p className="type-body-sm measure text-ink-muted">{description}</p>
      <p className="type-caption text-ink-subtle">{hint}</p>
    </div>
  );
}
